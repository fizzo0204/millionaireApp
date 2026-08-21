import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, map, of, switchMap } from 'rxjs';
import {
  signInWithCredential,
  GoogleAuthProvider,
  signInAnonymously,
  onAuthStateChanged,
  User,
  linkWithCredential,
  linkWithPopup,
  AuthCredential,
  signInWithPopup,
  FacebookAuthProvider,
  deleteUser,
  signOut as signOutFirebaseAuth,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { UserStatsService } from './user-stats.service';
import { firebaseAuth } from 'src/app/config/firebase.config';
import { environment } from 'src/environments/environment';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import {
  AccountConflictComparison,
  AppAuthProviderId,
  ProviderProfileMetadata,
} from 'src/app/models/auth.model';
import { PlayGamesAuthService } from './play-games-auth.service';
import { AuthProfileSyncService } from './auth-profile-sync.service';
import {
  AuthAccountLinkService,
  ExistingProviderProfileState,
} from './auth-account-link.service';
import { UserProfileMigrationSnapshot } from 'src/app/models/user-stats.model';
import { LinkRewardModalComponent } from 'src/app/components/link-reward-modal/link-reward-modal.component';
import { LINK_REWARD_MODAL_ID } from 'src/app/config/modal-ids.config';

/*
 * 'success-partial': i dati Firestore sono stati cancellati ma l'account
 * Auth originale no (deleteUser() ha esaurito i tentativi per un errore
 * diverso da requires-recent-login, es. rete). Dal punto di vista
 * dell'utente l'eliminazione e' comunque avvenuta: viene comunque spostato
 * su un profilo ospite pulito, vedi AuthService.deleteAccount(). Il
 * chiamante puo' trattarla come 'success' nell'interfaccia.
 */
export type DeleteAccountResult =
  | 'success'
  | 'success-partial'
  | 'requires-recent-login'
  | 'error';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly nativeAuthTimeoutMs = 30000;

  user$ = this.userSubject.asObservable();
  isLoading$ = this.loadingSubject.asObservable();

  /*
   * Versione "consapevole del vero collegamento" di isBaseProfile(), da usare
   * per decidere se mostrare l'invito/bottone "Collega account" (Impostazioni,
   * tap sul profilo in navbar, prompt periodico). isBaseProfile() da sola non
   * puo' bastare qui: per un profilo Play Games senza Facebook resta sempre
   * true anche dopo un vero collegamento Google, perche' providerData non
   * distingue quel collegamento dal companion google.com automatico (vedi
   * isBaseProfile). auth.loginRewardClaimed pero' e' un segnale affidabile:
   * viene impostato solo da un vero primo collegamento
   * (completeCurrentProfileAccountLink), mai dal solo auto-login Play Games
   * silenzioso, quindi lo usiamo per correggere il caso ambiguo.
   */
  shouldOfferAccountLink$: Observable<boolean> = this.user$.pipe(
    switchMap((user) => {
      if (!user) return of(false);
      if (user.isAnonymous) return of(true);
      if (!this.isBaseProfile(user)) return of(false);

      return this.userStatsService
        .getUserProfile(user.uid)
        .pipe(map((profile) => !profile?.auth?.loginRewardClaimed));
    }),
  );

  private initialAuthResolved = false;

  constructor(
    private userStatsService: UserStatsService,
    private playGamesAuthService: PlayGamesAuthService,
    private authProfileSyncService: AuthProfileSyncService,
    private authAccountLinkService: AuthAccountLinkService,
    private modalCtrl: ModalController,
  ) {
    onAuthStateChanged(firebaseAuth, async (user) => {
      this.debug(
        '👤 Stato auth cambiato →',
        user?.displayName || (user?.isAnonymous ? 'Anonimo' : 'null'),
      );

      if (!this.initialAuthResolved) {
        this.initialAuthResolved = true;

        if (await this.resolveInitialAuthState(user)) {
          return;
        }
      }

      if (user) {
        /*
         * Aggiorniamo subito lo stato auth della UI. Le operazioni Firestore
         * successive possono fallire se ci sono ancora listener aperti sul vecchio
         * profilo anonimo, ma non devono lasciare l'app bloccata come ospite.
         */
        this.userSubject.next(user);

        try {
          /*
           * Ogni utente Firebase diventa un profilo giocabile.
           * Anche l'anonimo ha un UID stabile, quindi puo salvare progressi,
           * monete, vite e reward in Firestore fino a quando non collega un account.
           */
          await this.userStatsService.ensureUserProfile(user);
          await this.hydrateStoredPlayGamesProfile(user);
        } catch (error) {
          console.warn(
            'Profilo utente non sincronizzato subito dopo il cambio auth:',
            error,
          );
        }
      } else {
        this.userSubject.next(null);
      }

      if (!this.initialAuthResolved) {
        this.initialAuthResolved = true;

        if (!user) {
          const playGamesUser = await this.playGamesAuthService.tryAutoSignIn();

          if (playGamesUser) {
            this.userSubject.next(playGamesUser);
            return;
          }

          this.debug('🚪 Nessun utente → creo accesso anonimo...');
          const anon = await signInAnonymously(firebaseAuth);
          await this.userStatsService.ensureUserProfile(anon.user);
          this.userSubject.next(anon.user);
          this.debug('🙈 Accesso anonimo creato');
        }
      }
    });
  }

  private async resolveInitialAuthState(user: User | null): Promise<boolean> {
    /*
     * Primo avvio Android:
     * 1. Se non esiste una sessione Firebase, proviamo subito Play Games.
     * 2. Se Android ci restituisce un anonimo locale ma Firestore non ha il
     *    profilo, lo trattiamo come un primo avvio e proviamo comunque
     *    Play Games prima di ricreare l'ospite.
     * 3. Se l'anonimo ha gia un profilo Firestore, rispettiamo quella scelta.
     */
    const shouldTryPlayGames = await this.shouldTryInitialPlayGames(user);

    if (shouldTryPlayGames) {
      const playGamesUser = await this.playGamesAuthService.tryAutoSignIn();

      if (playGamesUser) {
        this.clearInitialPlayGamesAutoSignInSuppression();
        this.userSubject.next(playGamesUser);
        return true;
      }
    }

    if (!user) {
      this.debug('Nessun utente: creo accesso anonimo...');
      const anon = await signInAnonymously(firebaseAuth);
      await this.userStatsService.ensureUserProfile(anon.user);
      this.userSubject.next(anon.user);
      this.debug('Accesso anonimo creato');
      return true;
    }

    if (!shouldTryPlayGames) {
      return false;
    }

    await this.userStatsService.ensureUserProfile(user);
    this.userSubject.next(user);

    return true;
  }

  private async shouldTryInitialPlayGames(user: User | null): Promise<boolean> {
    if (!this.playGamesAuthService.canAttemptAutoSignIn) return false;
    if (this.isInitialPlayGamesAutoSignInSuppressed()) return false;
    if (!user) return true;
    if (!user.isAnonymous) return false;

    /*
     * Se Firebase ci restituisce un anonimo locale al bootstrap, proviamo
     * comunque Play Games. L'unica eccezione e il logout/guest scelto
     * esplicitamente, gestito dal flag locale sopra.
     */
    return true;
  }

  rememberGuestChoice(): void {
    /*
     * Quando l'utente sceglie davvero di restare ospite, evitiamo che il
     * prossimo avvio lo riporti automaticamente su Play Games.
     */
    this.suppressInitialPlayGamesAutoSignIn();
  }

  private suppressInitialPlayGamesAutoSignIn(): void {
    try {
      localStorage.setItem(
        AUTH_CONFIG.playGames.autoSignInSuppressedStorageKey,
        'true',
      );
    } catch {
      // Se lo storage non e disponibile, l'app resta comunque funzionante.
    }
  }

  private clearInitialPlayGamesAutoSignInSuppression(): void {
    try {
      localStorage.removeItem(
        AUTH_CONFIG.playGames.autoSignInSuppressedStorageKey,
      );
    } catch {
      // Se lo storage non e disponibile, non blocchiamo login o link account.
    }
  }

  private isInitialPlayGamesAutoSignInSuppressed(): boolean {
    try {
      return (
        localStorage.getItem(
          AUTH_CONFIG.playGames.autoSignInSuppressedStorageKey,
        ) === 'true'
      );
    } catch {
      return false;
    }
  }

  async googleSignIn(): Promise<boolean> {
    this.loadingSubject.next(true);

    try {
      this.debug('🔹 Avvio login Google...');
      const isMobile = Capacitor.isNativePlatform();
      const currentUser = firebaseAuth.currentUser;

      if (!isMobile && currentUser?.isAnonymous) {
        const provider = new GoogleAuthProvider();

        try {
          const linkedUser = await linkWithPopup(currentUser, provider);
          await this.completeCurrentProfileAccountLink(
            linkedUser.user,
            AUTH_CONFIG.providers.google,
          );
          this.debug('Profilo corrente collegato a Google');
          return true;
        } catch (err: any) {
          if (err.code !== 'auth/credential-already-in-use') {
            throw err;
          }

          const credential = GoogleAuthProvider.credentialFromError(err);

          return this.handleExistingProviderCredential(
            AUTH_CONFIG.providers.google,
            credential,
            async () => signInWithPopup(firebaseAuth, provider),
          );
        }
      }

      let credential: AuthCredential | null = null;

      if (isMobile) {
        this.debug(
          '📱 Login Google tramite Capacitor FirebaseAuthentication...',
        );
        const result = await this.waitForNativeAuthResult(
          FirebaseAuthentication.signInWithGoogle({
            /*
             * Usiamo Credential Manager per mostrare la scelta account Google.
             * Il timeout esterno evita che il loader resti infinito se Android
             * non restituisce risposta dopo Annulla/Esci.
             */
            useCredentialManager: true,
            /*
             * Il plugin recupera solo il token Google.
             * Il link vero resta nel Firebase JS SDK, cosi l'ospite mantiene UID,
             * coins, daily reward e progressi quando l'account Google e nuovo.
             */
            skipNativeAuth: true,
          }),
          'Google',
        );

        if (!result) {
          return false;
        }

        if (!result.credential?.idToken) {
          throw new Error('❌ Nessun token Google ricevuto dal plugin');
        }

        credential = GoogleAuthProvider.credential(result.credential.idToken);
      } else {
        this.debug('💻 Login Google tramite popup web...');
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(firebaseAuth, provider);
        credential = GoogleAuthProvider.credentialFromResult(result);
      }

      if (!credential) {
        throw new Error('❌ Credenziale non valida');
      }

      if (
        this.shouldLinkCurrentProfileToProvider(
          currentUser,
          AUTH_CONFIG.providers.google,
        )
      ) {
        this.debug('🔗 Provo a collegare profilo corrente a Google...');
        try {
          /*
           * Firebase non crea due utenti: il profilo corrente viene promosso
           * allo stesso UID Google. Non dobbiamo cancellarlo, altrimenti
           * cancelleremmo anche l'account appena collegato.
           */
          const linkedUser = await linkWithCredential(currentUser!, credential);
          await this.completeCurrentProfileAccountLink(
            linkedUser.user,
            AUTH_CONFIG.providers.google,
          );
          this.debug('✅ Profilo corrente collegato a Google');
        } catch (err: any) {
          if (err.code === 'auth/credential-already-in-use') {
            const signedIn = await this.handleExistingProviderCredential(
              AUTH_CONFIG.providers.google,
              credential,
            );

            if (!signedIn) return false;
          } else if (err.code === 'auth/provider-already-linked') {
            /*
             * Firebase vede gia un provider google.com sull'utente corrente:
             * e il companion automatico di Play Games (stesso account Google),
             * non un secondo account da gestire. Confermiamo il profilo
             * attuale con i dati Google reali, senza cambiare uid.
             */
            await this.completeCurrentProfileAccountLink(
              currentUser!,
              AUTH_CONFIG.providers.google,
            );
            this.debug('Google gia collegato tramite Play Games: confermato');
          } else {
            throw err;
          }
        }
      } else if (
        currentUser &&
        this.userHasProvider(currentUser, AUTH_CONFIG.providers.playGames)
      ) {
        /*
         * Google companion di Play Games (vedi shouldLinkCurrentProfileToProvider):
         * nessuna vera operazione Firebase Auth sulla sessione corrente,
         * confermiamo il collegamento sullo stesso uid, esattamente come per
         * auth/provider-already-linked qui sopra. Riscontrato su device il
         * 2026-08-19 che un vero tentativo di link/sign-in con questa
         * credenziale crea sistematicamente un account separato invece di
         * riconoscere lo stesso account. Coerente col resto dell'app, che si
         * fida del client: se l'utente arriva fin qui e conferma, assumiamo
         * sia lo stesso account Google gia' dietro Play Games.
         */
        await this.completeCurrentProfileAccountLink(
          currentUser,
          AUTH_CONFIG.providers.google,
        );
        this.debug('Google gia collegato tramite Play Games: confermato (companion)');

        /*
         * Registriamo (su una app Firebase temporanea, non tocca la sessione
         * corrente) che questa credenziale Google appartiene a currentUser.
         * Senza questo, un tentativo futuro di collegare la stessa
         * credenziale da un'altra sessione (es. dopo un logout) non trova
         * nulla lato Firebase e crea un secondo account duplicato invece di
         * riconoscere il conflitto - riscontrato su device il 2026-08-19.
         */
        await this.claimGoogleCompanionCredential(credential, currentUser.uid);
      } else {
        await signInWithCredential(firebaseAuth, credential);
      }

      this.debug('✅ Accesso Google completato.');
      return true;
    } catch (error) {
      console.error('❌ Errore login Google:', error);
      return false;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async facebookSignIn(): Promise<boolean> {
    this.loadingSubject.next(true);

    try {
      this.debug('🔹 Avvio login Facebook...');
      const isMobile = Capacitor.isNativePlatform();
      const currentUser = firebaseAuth.currentUser;

      if (!isMobile && currentUser?.isAnonymous) {
        const provider = new FacebookAuthProvider();
        provider.addScope('public_profile');

        try {
          const linkedUser = await linkWithPopup(currentUser, provider);
          await this.completeCurrentProfileAccountLink(
            linkedUser.user,
            AUTH_CONFIG.providers.facebook,
          );
          this.debug('Profilo corrente collegato a Facebook');
          return true;
        } catch (err: any) {
          if (err.code !== 'auth/credential-already-in-use') {
            throw err;
          }

          const credential = FacebookAuthProvider.credentialFromError(err);

          return this.handleExistingProviderCredential(
            AUTH_CONFIG.providers.facebook,
            credential,
            async () => signInWithPopup(firebaseAuth, provider),
          );
        }
      }

      let credential: AuthCredential | null = null;

      if (isMobile) {
        this.debug(
          '📱 Login Facebook tramite Capacitor FirebaseAuthentication...',
        );
        const result = await this.waitForNativeAuthResult(
          FirebaseAuthentication.signInWithFacebook({
            /*
             * Come per Google: otteniamo solo il token e poi decidiamo noi
             * se collegarlo all'ospite o caricare un account Facebook esistente.
             */
            skipNativeAuth: true,
          }),
          'Facebook',
        );

        if (!result) {
          return false;
        }

        if (!result.credential?.accessToken) {
          throw new Error('❌ Nessun accessToken Facebook ricevuto dal plugin');
        }

        credential = FacebookAuthProvider.credential(
          result.credential.accessToken,
        );
      } else {
        this.debug('💻 Login Facebook tramite popup web...');
        const provider = new FacebookAuthProvider();
        provider.addScope('public_profile');
        const result = await signInWithPopup(firebaseAuth, provider);
        credential = FacebookAuthProvider.credentialFromResult(result);
      }

      if (!credential) {
        throw new Error('❌ Credenziale Facebook non valida');
      }

      if (
        this.shouldLinkCurrentProfileToProvider(
          currentUser,
          AUTH_CONFIG.providers.facebook,
        )
      ) {
        this.debug('🔗 Provo a collegare profilo corrente a Facebook...');
        try {
          /*
           * Stesso comportamento di Google: il profilo corrente diventa account Facebook
           * mantenendo UID e progressi, quindi non esiste un anonimo separato.
           */
          const linkedUser = await linkWithCredential(currentUser!, credential);
          await this.completeCurrentProfileAccountLink(
            linkedUser.user,
            AUTH_CONFIG.providers.facebook,
          );
          this.debug('✅ Profilo corrente collegato a Facebook');
        } catch (err: any) {
          if (err.code === 'auth/credential-already-in-use') {
            const signedIn = await this.handleExistingProviderCredential(
              AUTH_CONFIG.providers.facebook,
              credential,
            );

            if (!signedIn) return false;
          } else {
            throw err;
          }
        }
      } else {
        await signInWithCredential(firebaseAuth, credential);
      }

      this.debug('✅ Accesso Facebook completato.');
      return true;
    } catch (error) {
      console.error('❌ Errore login Facebook:', error);
      return false;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  private async waitForNativeAuthResult<T>(
    operation: Promise<T>,
    providerLabel: string,
  ): Promise<T | null> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), this.nativeAuthTimeoutMs);
    });

    try {
      const result = await Promise.race([operation, timeout]);

      if (result === null) {
        console.warn(
          `${providerLabel}: login nativo annullato o rimasto senza risposta.`,
        );
      }

      return result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async playGamesSignIn(): Promise<boolean> {
    this.loadingSubject.next(true);

    try {
      this.debug('Avvio collegamento Play Games...');

      const currentUser = firebaseAuth.currentUser;
      const playGamesResult =
        await this.playGamesAuthService.createFirebaseCredentialFromNativeSignIn();

      if (!playGamesResult) {
        return false;
      }

      if (
        this.shouldLinkCurrentProfileToProvider(
          currentUser,
          AUTH_CONFIG.providers.playGames,
        )
      ) {
        this.debug('Controllo se Play Games ha gia un profilo TurtleMind...');
        const profileSnapshot = await this.createCurrentProfileSnapshot();
        const existingProfileState = await this.getExistingProviderProfileState(
          playGamesResult.credential,
        );

        if (existingProfileState?.profileExists) {
          /*
           * Play Games ha gia un profilo TurtleMind: mostriamo la stessa
           * modale di conflitto usata per Google/Facebook.
           */
          const shouldSwitch = await this.confirmExistingProviderSwitch(
            AUTH_CONFIG.providers.playGames,
            profileSnapshot,
            existingProfileState,
          );

          if (!shouldSwitch) {
            console.warn('Play Games gia esistente: resto sul profilo attuale');
            return false;
          }

          const signedIn = await this.signInWithFreshPlayGamesCredential(
            profileSnapshot,
            false,
          );

          if (!signedIn) return false;
        } else if (existingProfileState) {
          /*
           * Play Games esiste solo in Firebase Auth, oppure e stato appena
           * creato dal controllo temporaneo, ma non ha ancora un profilo
           * TurtleMind: importiamo direttamente i progressi dell'ospite.
           */
          const signedIn = await this.signInWithFreshPlayGamesCredential(
            profileSnapshot,
            true,
          );

          if (!signedIn) return false;
        } else {
          console.warn(
            'Controllo Play Games non riuscito: provo il link diretto con credenziale fresca',
          );
          const freshPlayGamesResult =
            await this.playGamesAuthService.createFirebaseCredentialFromNativeSignIn();

          if (!freshPlayGamesResult) {
            return false;
          }

          try {
            const linkedUser = await linkWithCredential(
              currentUser!,
              freshPlayGamesResult.credential,
            );
            await this.completeCurrentProfileAccountLink(
              linkedUser.user,
              AUTH_CONFIG.providers.playGames,
              freshPlayGamesResult.profile,
            );
            this.debug('Profilo corrente collegato a Play Games');
          } catch (err: any) {
            if (this.isCredentialAlreadyInUseError(err)) {
              const signedIn = await this.handleExistingPlayGamesProfile(
                freshPlayGamesResult.credential,
              );

              if (!signedIn) return false;
            } else {
              throw err;
            }
          }
        }
      } else {
        /*
         * Caso raro ma utile: se non c'e un profilo base da collegare,
         * entriamo direttamente con Play Games e poi marchiamo Firestore.
         */
        const signedInUser = await signInWithCredential(
          firebaseAuth,
          playGamesResult.credential,
        );

        await this.syncSignedInProviderProfile(
          signedInUser.user,
          AUTH_CONFIG.providers.playGames,
          playGamesResult.profile,
        );
      }

      this.debug('Accesso Play Games completato.');
      this.clearInitialPlayGamesAutoSignInSuppression();
      return true;
    } catch (error) {
      console.error('Errore login Play Games:', error);
      return false;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async logout(): Promise<void> {
    this.loadingSubject.next(true);

    try {
      this.debug('👋 Effettuo logout...');

      await FirebaseAuthentication.signOut();
      await firebaseAuth.signOut();
      this.suppressInitialPlayGamesAutoSignIn();

      this.debug('⚪ Creo nuovo utente anonimo dopo logout...');
      const anon = await signInAnonymously(firebaseAuth);
      await this.userStatsService.ensureUserProfile(anon.user);

      this.debug('🙈 Nuovo utente anonimo generato.');
      this.userSubject.next(anon.user);
    } catch (err) {
      console.error('❌ Errore durante logout:', err);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  // Elimina definitivamente account e dati dell'utente corrente.
  async deleteAccount(): Promise<DeleteAccountResult> {
    const currentUser = firebaseAuth.currentUser;

    if (!currentUser) return 'error';

    /*
     * Controllo preventivo: se deleteUser() rifiutasse per login non recente
     * DOPO aver gia' cancellato i dati Firestore (vedi sotto), l'utente
     * perderebbe i progressi per sempre pur restando con l'account Auth
     * attivo. Meglio bloccare qui, prima di cancellare qualunque cosa.
     */
    if (this.requiresRecentLoginForDeletion(currentUser)) {
      this.debug('Eliminazione account: richiede login recente (controllo preventivo).');
      return 'requires-recent-login';
    }

    this.loadingSubject.next(true);

    try {
      /*
       * Cancelliamo prima i dati Firestore, mentre siamo ancora autenticati
       * come quell'utente: le regole di sicurezza richiedono request.auth.uid,
       * che sparisce non appena l'account Auth viene eliminato.
       */
      await this.userStatsService.deleteUserProfileData(currentUser.uid);

      const deletion = await this.deleteFirebaseAuthUserWithRetry(currentUser);

      if (deletion === 'requires-recent-login') {
        this.debug('Eliminazione account: richiede login recente.');
        return 'requires-recent-login';
      }

      if (deletion === 'failed') {
        /*
         * I dati sono gia' spariti ma l'account Auth originale no: lasciarlo
         * cosi' e' pericoloso, perche' ensureUserProfile() lo "resusciterebbe"
         * in automatico con un profilo vuoto al prossimo avvio (vedi
         * resolveInitialAuthState, chiamato ad ogni apertura app). Spostiamo
         * quindi comunque l'utente su una sessione ospite pulita: l'oggetto
         * Auth originale resta un residuo orfano senza profilo TurtleMind,
         * ma per l'utente l'eliminazione e' comunque completa (nessun dato,
         * nessun accesso residuo agli account collegati).
         */
        console.error(
          'Eliminazione account Auth non riuscita dopo i tentativi: dati gia cancellati, sposto su un profilo ospite pulito.',
        );

        await this.startFreshGuestSessionAfterAccountDeletion();
        return 'success-partial';
      }

      await this.startFreshGuestSessionAfterAccountDeletion();
      return 'success';
    } catch (error) {
      console.error('❌ Errore durante eliminazione account:', error);
      return 'error';
    } finally {
      this.loadingSubject.next(false);
    }
  }

  // Prova a cancellare l'account Auth con un tentativo aggiuntivo per errori transitori (es. rete).
  private async deleteFirebaseAuthUserWithRetry(
    user: User,
  ): Promise<'deleted' | 'requires-recent-login' | 'failed'> {
    const tentativiMax = 2;

    for (let tentativo = 1; tentativo <= tentativiMax; tentativo++) {
      try {
        await deleteUser(user);
        return 'deleted';
      } catch (error: any) {
        if (error?.code === 'auth/requires-recent-login') {
          return 'requires-recent-login';
        }

        console.error(
          `Errore eliminazione account Auth (tentativo ${tentativo}/${tentativiMax}):`,
          error,
        );

        if (tentativo < tentativiMax) {
          await this.wait(700);
        }
      }
    }

    return 'failed';
  }

  // Disconnette la sessione corrente e apre un profilo ospite pulito, usato a fine eliminazione account.
  private async startFreshGuestSessionAfterAccountDeletion(): Promise<void> {
    await FirebaseAuthentication.signOut();
    this.suppressInitialPlayGamesAutoSignIn();

    const anon = await signInAnonymously(firebaseAuth);
    await this.userStatsService.ensureUserProfile(anon.user);
    this.userSubject.next(anon.user);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private requiresRecentLoginForDeletion(user: User): boolean {
    const lastSignInTime = user.metadata.lastSignInTime;

    if (!lastSignInTime) return false;

    const elapsedMs = Date.now() - new Date(lastSignInTime).getTime();

    return elapsedMs > AUTH_CONFIG.deleteAccount.recentLoginWindowMs;
  }

  private async completeCurrentProfileAccountLink(
    user: User,
    linkedProviderId?: AppAuthProviderId,
    providerProfile?: ProviderProfileMetadata,
  ): Promise<void> {
    /*
     * Questo e il "merge" corretto per un account nuovo:
     * Firebase mantiene lo stesso UID del profilo corrente
     * (ospite o Play Games) e aggiunge Google/Facebook.
     * Quindi stats, monete, dailyReward, avatar e sottocollezioni restano gia
     * nello stesso documento Firestore, senza copiare dati tra utenti diversi.
     */
    await this.userStatsService.ensureUserProfile(user);
    await this.userStatsService.mergeCurrentProgressIntoLinkedAccount(user.uid);

    const linkReward = await this.userStatsService.claimLinkReward(user.uid);

    if (linkReward) {
      await this.showLinkRewardToast(linkReward);
    }

    const providerMetadata =
      providerProfile ??
      this.getProviderMetadataFromFirebaseUser(user, linkedProviderId);

    if (providerMetadata) {
      await this.applyProviderProfileMetadata(user, providerMetadata);
    }

    if (linkedProviderId === AUTH_CONFIG.providers.playGames) {
      /*
       * Play Games passa da una credenziale custom: questo rende esplicito in
       * Firestore che il profilo base non e piu anonimo.
       */
      await this.userStatsService.markPlayGamesProfile(
        user.uid,
        providerMetadata,
      );
    }

    if (linkedProviderId === AUTH_CONFIG.providers.google) {
      /*
       * Marca il collegamento Google come confermato dall'utente (non solo
       * companion di Play Games): il badge in navbar lo usa per mostrare
       * GOOGLE invece di PLAY GAMES dopo un vero collegamento.
       */
      await this.userStatsService.markGoogleLinkConfirmed(user.uid);
    }

    try {
      await user.reload();
    } catch {
      // Se Firebase non ricarica subito il provider, la UI usera il fallback Firestore.
    }

    this.userSubject.next(firebaseAuth.currentUser ?? user);
  }

  private async showLinkRewardToast(reward: {
    coins: number;
    xp: number;
  }): Promise<void> {
    if (reward.coins <= 0 && reward.xp <= 0) return;

    const modal = await this.modalCtrl.create({
      component: LinkRewardModalComponent,
      id: LINK_REWARD_MODAL_ID,
      componentProps: {
        coins: reward.coins,
        xp: reward.xp,
      },
      cssClass: 'link-reward-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();
  }

  // Mostra i log solo in sviluppo, evitando console.log sparsi in produzione.
  private debug(...args: unknown[]): void {
    if (!environment.production) {
      console.log(...args);
    }
  }

  // Recupera nome e foto dal provider collegato, utile dopo il link da ospite a Google/Facebook.
  private getProviderMetadataFromFirebaseUser(
    user: User,
    providerId?: AppAuthProviderId,
  ): ProviderProfileMetadata | undefined {
    if (!providerId) return undefined;

    const providerData = user.providerData.find(
      (provider) => provider.providerId === providerId,
    );

    const displayName = providerData?.displayName ?? user.displayName;
    const photoURL = providerData?.photoURL ?? user.photoURL;

    if (!displayName && !photoURL) return undefined;

    return {
      displayName: displayName ?? undefined,
      photoURL: photoURL ?? undefined,
    };
  }

  isBaseProfile(user: User | null): boolean {
    /*
     * Profili base = profili giocabili ma non ancora collegati a un account
     * forte dell'app. L'anonimo e Play Games puro possono giocare, ma in UI
     * proponiamo "Collega account" invece di "Logout".
     */
    if (!user) return false;
    if (user.isAnonymous) return true;

    const hasPlayGames = this.userHasProvider(
      user,
      AUTH_CONFIG.providers.playGames,
    );

    if (!hasPlayGames) return false;

    const hasFacebook = this.userHasProvider(
      user,
      AUTH_CONFIG.providers.facebook,
    );

    /*
     * Non controlliamo hasGoogle qui: Play Games su Android registra sempre
     * anche un provider "google.com" companion (e legato allo stesso account
     * Google), quindi risulterebbe sempre presente anche se l'utente non ha
     * mai collegato Google esplicitamente. Usarlo bloccherebbe per sempre il
     * bottone "Collega account" e il vero collegamento Google per chi ha
     * fatto solo login Play Games.
     */
    return !hasFacebook;
  }

  isPlayGamesBaseProfile(user: User | null): boolean {
    if (!user || user.isAnonymous) return false;

    return this.isBaseProfile(user);
  }

  private shouldLinkCurrentProfileToProvider(
    user: User | null,
    providerId: AppAuthProviderId,
  ): boolean {
    /*
     * L'ospite e Play Games sono profili base: quando l'utente sceglie
     * Google/Facebook proviamo prima a collegare l'account, cosi i progressi
     * restano sullo stesso UID. Se il provider esiste gia, gestiamo il conflitto
     * nella modale e applichiamo la logica di pulizia del profilo corrente.
     */
    if (!this.isBaseProfile(user)) return false;

    /*
     * NON tentiamo mai linkWithCredential/signInWithCredential per Google
     * quando l'utente ha gia' Play Games (companion google.com, vedi
     * isBaseProfile): riscontrato su device il 2026-08-19 che Firebase tratta
     * il companion e una credenziale Google interattiva come identita' DIVERSE
     * a livello di backend. Un vero tentativo di linkWithCredential non genera
     * mai auth/provider-already-linked in questo caso: cade invece nel ramo
     * "questo Google esiste gia' altrove" e crea/carica sistematicamente un
     * account separato con un uid diverso (non solo nel raro caso di
     * collisione con un vecchio account reale, come si pensava ieri). Per
     * questo caso specifico il collegamento va confermato senza nessuna vera
     * operazione Firebase Auth: vedi il ramo `else` di googleSignIn().
     */
    if (
      providerId === AUTH_CONFIG.providers.google &&
      this.userHasProvider(user!, AUTH_CONFIG.providers.playGames)
    ) {
      return false;
    }

    return !this.userHasProvider(user!, providerId);
  }

  private userHasProvider(user: User, providerId: AppAuthProviderId): boolean {
    return user.providerData.some(
      (provider) => provider.providerId === providerId,
    );
  }

  private isCredentialAlreadyInUseError(error: any): boolean {
    const code = String(error?.code ?? '');
    const message = String(
      error?.message ?? error?.customData?.error?.message ?? '',
    );

    return (
      code === 'auth/credential-already-in-use' ||
      code === 'auth/federated-user-id-already-linked' ||
      message.includes('CREDENTIAL_ALREADY_IN_USE') ||
      message.includes('FEDERATED_USER_ID_ALREADY_LINKED')
    );
  }

  private async handleExistingProviderCredential(
    providerId: AppAuthProviderId,
    credential: AuthCredential | null,
    signInFallback?: () => Promise<unknown>,
  ): Promise<boolean> {
    const profileSnapshot = await this.createCurrentProfileSnapshot();
    let existingProfileState: ExistingProviderProfileState | null = null;

    if (credential && profileSnapshot) {
      existingProfileState = await this.getExistingProviderProfileState(
        credential,
      );

      if (existingProfileState?.companionClaimOwnerUid) {
        /*
         * Questo Google e' gia' il companion confermato di un altro profilo
         * (di solito Play Games), vedi claimGoogleCompanionCredential(). Non
         * possiamo autenticare via Google su quel profilo (il vero
         * collegamento registrato lato Firebase e' solo verso Play Games, un
         * credential Google non e' mai stato davvero linkato li'): rifacciamo
         * silenziosamente il login Play Games, che per questo uid trova un
         * profilo esistente e mostra la stessa modale di conflitto usata
         * altrove nell'app - l'utente sceglie se caricarlo esattamente come
         * per un vero conflitto, invece di un vicolo cieco.
         */
        return this.playGamesSignIn();
      }

      if (existingProfileState && !existingProfileState.profileExists) {
        /*
         * Caso importante: Google/Facebook esiste gia in Firebase Auth, ma non
         * ha mai creato un profilo TurtleMind. Non mostriamo la modale di
         * conflitto: importiamo direttamente il profilo corrente.
         */
        console.warn(
          'Account Auth esistente senza profilo TurtleMind: importo profilo corrente',
        );

        const profiloOspiteEliminato =
          await this.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
            profileSnapshot,
          );

        try {
          const signedInUser = await signInWithCredential(
            firebaseAuth,
            credential,
          );

          await this.userStatsService.restoreProfileSnapshotIntoLinkedAccount(
            signedInUser.user,
            profileSnapshot,
          );

          await this.syncSignedInProviderProfile(signedInUser.user, providerId);

          /*
           * Questo e' comunque un vero primo collegamento a un provider reale
           * (Google/Facebook, mai Play Games - vedi i chiamanti), solo che
           * l'account Auth esisteva gia' senza profilo TurtleMind. A
           * differenza di completeCurrentProfileAccountLink() (chiamato solo
           * quando l'uid resta lo stesso), qui non veniva mai assegnato il
           * premio una tantum: bug reale trovato il 2026-08-20, non solo un
           * caso limite del companion Google/Play Games.
           */
          const linkReward = await this.userStatsService.claimLinkReward(
            signedInUser.user.uid,
          );

          if (linkReward) {
            await this.showLinkRewardToast(linkReward);
          }

          if (!profiloOspiteEliminato) {
            await this.deleteProfileSnapshotIfAnonymous(
              profileSnapshot,
              signedInUser.user.uid,
            );
          }

          return true;
        } catch (error) {
          await this.retryImportedProfileSnapshotAfterFailure(
            profileSnapshot,
            profiloOspiteEliminato,
          );
          throw error;
        }
      }
    }

    const shouldSwitch = await this.confirmExistingProviderSwitch(
      providerId,
      profileSnapshot,
      existingProfileState,
    );

    if (!shouldSwitch) {
      console.warn('Account gia esistente: resto sul profilo attuale');
      return false;
    }

    console.warn('Account gia esistente: carico profilo salvato');

    if (credential) {
      const profiloOspiteEliminato =
        await this.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
          profileSnapshot,
        );

      try {
        const signedInUser = await signInWithCredential(
          firebaseAuth,
          credential,
        );

        await this.syncSignedInProviderProfile(signedInUser.user, providerId);

        if (!profiloOspiteEliminato) {
          await this.deleteProfileSnapshotIfAnonymous(
            profileSnapshot,
            signedInUser.user.uid,
          );
        }

        return true;
      } catch (error) {
        await this.restoreDeletedAnonymousSnapshotIfNeeded(
          profileSnapshot,
          profiloOspiteEliminato,
        );
        throw error;
      }
    }

    if (signInFallback) {
      const profiloOspiteEliminato =
        await this.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
          profileSnapshot,
        );

      try {
        await signInFallback();

        if (!profiloOspiteEliminato) {
          await this.deleteProfileSnapshotIfAnonymous(profileSnapshot);
        }

        return true;
      } catch (error) {
        await this.restoreDeletedAnonymousSnapshotIfNeeded(
          profileSnapshot,
          profiloOspiteEliminato,
        );
        throw error;
      }
    }

    return false;
  }

  private async handleExistingPlayGamesProfile(
    consumedCredential?: AuthCredential,
  ): Promise<boolean> {
    /*
     * Il serverAuthCode di Play Games puo essere monouso. Se il link fallisce
     * perche quel Play Games esiste gia, non riusiamo la credenziale appena
     * consumata: chiediamo conferma e poi otteniamo un token fresco.
     */
    const profileSnapshot = await this.createCurrentProfileSnapshot();
    const existingProfileState =
      consumedCredential && profileSnapshot
        ? await this.getExistingProviderProfileState(consumedCredential)
        : null;

    if (existingProfileState && !existingProfileState.profileExists) {
      console.warn(
        'Play Games esiste in Auth ma non ha profilo TurtleMind: importo il profilo corrente',
      );

      const freshPlayGamesResult =
        await this.playGamesAuthService.createFirebaseCredentialFromNativeSignIn();

      if (!freshPlayGamesResult) {
        return false;
      }

      const profiloOspiteEliminato =
        await this.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
          profileSnapshot,
        );

      try {
        const signedInUser = await signInWithCredential(
          firebaseAuth,
          freshPlayGamesResult.credential,
        );

        if (profileSnapshot) {
          await this.userStatsService.restoreProfileSnapshotIntoLinkedAccount(
            signedInUser.user,
            profileSnapshot,
          );
        }

        await this.syncSignedInProviderProfile(
          signedInUser.user,
          AUTH_CONFIG.providers.playGames,
          freshPlayGamesResult.profile,
        );

        if (!profiloOspiteEliminato) {
          await this.deleteProfileSnapshotIfAnonymous(
            profileSnapshot,
            signedInUser.user.uid,
          );
        }

        return true;
      } catch (error) {
        await this.retryImportedProfileSnapshotAfterFailure(
          profileSnapshot,
          profiloOspiteEliminato,
        );
        throw error;
      }
    }

    const shouldSwitch = await this.confirmExistingProviderSwitch(
      AUTH_CONFIG.providers.playGames,
      profileSnapshot,
      existingProfileState,
    );

    if (!shouldSwitch) {
      console.warn('Play Games gia esistente: resto sul profilo attuale');
      return false;
    }

    const freshPlayGamesResult =
      await this.playGamesAuthService.createFirebaseCredentialFromNativeSignIn();

    if (!freshPlayGamesResult) {
      return false;
    }

    const profiloOspiteEliminato =
      await this.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
        profileSnapshot,
      );

    try {
      const signedInUser = await signInWithCredential(
        firebaseAuth,
        freshPlayGamesResult.credential,
      );

      await this.syncSignedInProviderProfile(
        signedInUser.user,
        AUTH_CONFIG.providers.playGames,
        freshPlayGamesResult.profile,
      );

      if (!profiloOspiteEliminato) {
        await this.deleteProfileSnapshotIfAnonymous(
          profileSnapshot,
          signedInUser.user.uid,
        );
      }

      return true;
    } catch (error) {
      await this.restoreDeletedAnonymousSnapshotIfNeeded(
        profileSnapshot,
        profiloOspiteEliminato,
      );
      throw error;
    }
  }

  private async signInWithFreshPlayGamesCredential(
    profileSnapshot: UserProfileMigrationSnapshot | null,
    importCurrentProfile: boolean,
  ): Promise<boolean> {
    /*
     * Dopo un controllo temporaneo la credenziale Play Games potrebbe essere
     * stata consumata. Per entrare davvero nell'app chiediamo sempre un token
     * fresco, poi decidiamo se importare i progressi correnti o caricare quelli
     * gia salvati su Play Games.
     */
    const freshPlayGamesResult =
      await this.playGamesAuthService.createFirebaseCredentialFromNativeSignIn();

    if (!freshPlayGamesResult) {
      return false;
    }

    const profiloOspiteEliminato =
      await this.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
        profileSnapshot,
      );

    try {
      const signedInUser = await signInWithCredential(
        firebaseAuth,
        freshPlayGamesResult.credential,
      );

      if (importCurrentProfile && profileSnapshot) {
        await this.userStatsService.restoreProfileSnapshotIntoLinkedAccount(
          signedInUser.user,
          profileSnapshot,
        );
      }

      await this.syncSignedInProviderProfile(
        signedInUser.user,
        AUTH_CONFIG.providers.playGames,
        freshPlayGamesResult.profile,
      );

      if (!profiloOspiteEliminato) {
        await this.deleteProfileSnapshotIfAnonymous(
          profileSnapshot,
          signedInUser.user.uid,
        );
      }

      return true;
    } catch (error) {
      /*
       * Stessa distinzione di handleExistingPlayGamesProfile: se stiamo
       * importando il profilo corrente (nessun rischio di sovrascrivere un
       * account con progressi propri), il ripristino va tentato sull'utente
       * corrente qualunque esso sia; altrimenti va limitato al caso in cui
       * siamo ancora sull'ospite.
       */
      if (importCurrentProfile) {
        await this.retryImportedProfileSnapshotAfterFailure(
          profileSnapshot,
          profiloOspiteEliminato,
        );
      } else {
        await this.restoreDeletedAnonymousSnapshotIfNeeded(
          profileSnapshot,
          profiloOspiteEliminato,
        );
      }
      throw error;
    }
  }

  // Ripristina il profilo anonimo se il passaggio al provider fallisce dopo la cancellazione preventiva.
  // Usato solo quando l'account di destinazione aveva GIA' un proprio profilo TurtleMind
  // (flusso "carico profilo salvato"): se il login e' fallito del tutto siamo ancora
  // sull'ospite (stesso uid dello snapshot) e possiamo ridargli i suoi dati. Se invece il
  // login e' riuscito ma un passo successivo e' fallito, l'utente corrente e' gia'
  // sull'altro account con i suoi progressi reali: NON dobbiamo scriverci sopra lo
  // snapshot dell'ospite, quindi non facciamo nulla (uid diverso da profileSnapshot.uid).
  private async restoreDeletedAnonymousSnapshotIfNeeded(
    profileSnapshot: UserProfileMigrationSnapshot | null,
    profiloOspiteEliminato: boolean,
  ): Promise<void> {
    if (!profileSnapshot || !profiloOspiteEliminato) return;

    const currentUser = firebaseAuth.currentUser;

    if (!currentUser || currentUser.uid !== profileSnapshot.uid) {
      return;
    }

    try {
      await this.userStatsService.restoreProfileSnapshotIntoLinkedAccount(
        currentUser,
        profileSnapshot,
      );
    } catch (error) {
      console.warn(
        'Non sono riuscito a ripristinare il profilo ospite dopo il login fallito:',
        error,
      );
    }
  }

  /*
   * Variante usata solo nel flusso "importa profilo ospite" (l'account di
   * destinazione NON aveva ancora un proprio profilo TurtleMind, quindi non
   * c'e' rischio di sovrascrivere progressi altrui). A differenza di
   * restoreDeletedAnonymousSnapshotIfNeeded, qui il ripristino va tentato
   * sull'utente Firebase corrente qualunque esso sia: se signInWithCredential
   * e' fallito siamo ancora sull'ospite (stesso uid dello snapshot); se invece
   * e' riuscito ma un passo successivo (merge/sync) e' fallito, l'utente
   * corrente e' gia' il nuovo account e il ripristino va completato li' -
   * altrimenti i progressi dell'ospite, gia' cancellati, andrebbero persi.
   */
  private async retryImportedProfileSnapshotAfterFailure(
    profileSnapshot: UserProfileMigrationSnapshot | null,
    profiloOspiteEliminato: boolean,
  ): Promise<void> {
    if (!profileSnapshot || !profiloOspiteEliminato) return;

    const currentUser = firebaseAuth.currentUser;

    if (!currentUser) return;

    try {
      await this.userStatsService.restoreProfileSnapshotIntoLinkedAccount(
        currentUser,
        profileSnapshot,
      );
    } catch (error) {
      console.warn(
        "Non sono riuscito a completare l'importazione del profilo ospite dopo un errore:",
        error,
      );
    }
  }

  // Sincronizza il documento utente con i dati del provider e aggiorna lo stato UI.
  private async syncSignedInProviderProfile(
    user: User,
    providerId: AppAuthProviderId,
    providerProfile?: ProviderProfileMetadata,
  ): Promise<void> {
    const currentUser =
      await this.authProfileSyncService.syncSignedInProviderProfile(
        user,
        providerId,
        providerProfile,
      );

    this.userSubject.next(currentUser);
  }

  // Applica displayName e photoURL del provider al profilo Firebase corrente.
  private async applyProviderProfileMetadata(
    user: User,
    providerProfile?: ProviderProfileMetadata,
  ): Promise<void> {
    await this.authProfileSyncService.applyProviderProfileMetadata(
      user,
      providerProfile,
    );
  }

  // Recupera i dati Play Games salvati quando Firebase non li ha ancora caricati.
  private async hydrateStoredPlayGamesProfile(user: User): Promise<void> {
    const currentUser =
      await this.authProfileSyncService.hydrateStoredPlayGamesProfile(user);

    if (currentUser) {
      this.userSubject.next(currentUser);
    }
  }

  // Crea uno snapshot del profilo corrente prima di un possibile cambio account.
  private async createCurrentProfileSnapshot(): Promise<UserProfileMigrationSnapshot | null> {
    const currentUser = firebaseAuth.currentUser;

    if (!currentUser) return null;

    const linkableProviders: AppAuthProviderId[] = [
      AUTH_CONFIG.providers.google,
      AUTH_CONFIG.providers.facebook,
      AUTH_CONFIG.providers.playGames,
    ];

    if (
      !linkableProviders.some((providerId) =>
        this.shouldLinkCurrentProfileToProvider(currentUser, providerId),
      )
    ) {
      return null;
    }

    return this.userStatsService.createProfileMigrationSnapshot(
      currentUser.uid,
    );
  }

  // Verifica se il provider esistente ha già un profilo TurtleMind salvato.
  private async getExistingProviderProfileState(
    credential: AuthCredential,
  ): Promise<ExistingProviderProfileState | null> {
    return this.authAccountLinkService.getExistingProviderProfileState(
      credential,
    );
  }

  // Chiede conferma prima di passare a un provider che ha già un profilo,
  // mostrando monete/XP di entrambi i profili a confronto.
  private async confirmExistingProviderSwitch(
    providerId: AppAuthProviderId,
    profileSnapshot: UserProfileMigrationSnapshot | null,
    existingProfileState: ExistingProviderProfileState | null,
  ): Promise<boolean> {
    const currentStats = this.extractStatsFromSnapshot(profileSnapshot);
    const comparison: AccountConflictComparison = {
      currentCoins: currentStats.coins,
      currentXp: currentStats.xp,
      existingCoins:
        existingProfileState?.coins ?? this.userStatsService.defaultStats.coins,
      existingXp:
        existingProfileState?.xp ?? this.userStatsService.defaultStats.xp,
    };

    return this.authAccountLinkService.confirmExistingProviderSwitch(
      providerId,
      comparison,
    );
  }

  // Estrae monete/XP da uno snapshot del profilo corrente, con i default per un profilo mai giocato.
  private extractStatsFromSnapshot(
    profileSnapshot: UserProfileMigrationSnapshot | null,
  ): { coins: number; xp: number } {
    const stats = profileSnapshot?.profile?.['stats'] as
      | { coins?: unknown; xp?: unknown }
      | undefined;

    return {
      coins:
        typeof stats?.coins === 'number'
          ? stats.coins
          : this.userStatsService.defaultStats.coins,
      xp:
        typeof stats?.xp === 'number'
          ? stats.xp
          : this.userStatsService.defaultStats.xp,
    };
  }

  // Elimina il profilo ospite prima del cambio account, finché le rules lo permettono.
  private async deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
    profileSnapshot: UserProfileMigrationSnapshot | null,
  ): Promise<boolean> {
    return this.authAccountLinkService.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
      profileSnapshot,
    );
  }

  // Elimina il profilo ospite dopo il cambio account, senza bloccare il login se fallisce.
  private async deleteProfileSnapshotIfAnonymous(
    profileSnapshot: UserProfileMigrationSnapshot | null,
    targetUid?: string,
  ): Promise<void> {
    await this.authAccountLinkService.deleteProfileSnapshotIfAnonymous(
      profileSnapshot,
      targetUid,
    );
  }

  /*
   * Registra lato Firebase che una credenziale Google (companion di Play
   * Games) appartiene a ownerUid, cosi' un tentativo futuro di collegarla da
   * un'altra sessione riconosce il conflitto invece di creare un account
   * duplicato. Best-effort: un fallimento qui non deve mai far fallire il
   * collegamento (gia' confermato localmente a questo punto).
   */
  private async claimGoogleCompanionCredential(
    credential: AuthCredential,
    ownerUid: string,
  ): Promise<void> {
    try {
      await this.authAccountLinkService.claimGoogleCompanionCredential(
        credential,
        ownerUid,
      );
    } catch (error) {
      console.warn('Claim companion Google non riuscito:', error);
    }
  }
}
