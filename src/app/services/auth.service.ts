import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
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
  signOut as signOutFirebaseAuth,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { UserStatsService } from './user-stats.service';
import { firebaseAuth } from 'src/app/config/firebase.config';
import { environment } from 'src/environments/environment';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import {
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

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly nativeAuthTimeoutMs = 30000;

  user$ = this.userSubject.asObservable();
  isLoading$ = this.loadingSubject.asObservable();

  private initialAuthResolved = false;

  constructor(
    private userStatsService: UserStatsService,
    private playGamesAuthService: PlayGamesAuthService,
    private authProfileSyncService: AuthProfileSyncService,
    private authAccountLinkService: AuthAccountLinkService,
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
          } else {
            throw err;
          }
        }
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
              const signedIn = await this.handleExistingPlayGamesProfile();

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

    try {
      await user.reload();
    } catch {
      // Se Firebase non ricarica subito il provider, la UI usera il fallback Firestore.
    }

    this.userSubject.next(firebaseAuth.currentUser ?? user);
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

  canConnectPlayGames(user: User | null): boolean {
    /*
     * Il bottone manuale Play Games serve solo agli ospiti Android.
     * Chi e gia Play Games deve vedere Google/Facebook come collegamento forte.
     */
    return (
      this.playGamesAuthService.canUsePlayGames && Boolean(user?.isAnonymous)
    );
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
    const hasGoogle = this.userHasProvider(user, AUTH_CONFIG.providers.google);
    const hasFacebook = this.userHasProvider(
      user,
      AUTH_CONFIG.providers.facebook,
    );

    return hasPlayGames && !hasGoogle && !hasFacebook;
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

    if (credential && profileSnapshot) {
      const existingProfileState =
        await this.getExistingProviderProfileState(credential);

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

        const signedInUser = await signInWithCredential(
          firebaseAuth,
          credential,
        );

        await this.userStatsService.restoreProfileSnapshotIntoLinkedAccount(
          signedInUser.user,
          profileSnapshot,
        );

        await this.syncSignedInProviderProfile(signedInUser.user, providerId);

        if (!profiloOspiteEliminato) {
          await this.deleteProfileSnapshotIfAnonymous(
            profileSnapshot,
            signedInUser.user.uid,
          );
        }

        return true;
      }
    }

    const shouldSwitch = await this.confirmExistingProviderSwitch(providerId);

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

      const signedInUser = await signInWithCredential(firebaseAuth, credential);

      await this.syncSignedInProviderProfile(signedInUser.user, providerId);

      if (!profiloOspiteEliminato) {
        await this.deleteProfileSnapshotIfAnonymous(
          profileSnapshot,
          signedInUser.user.uid,
        );
      }

      return true;
    }

    if (signInFallback) {
      const profiloOspiteEliminato =
        await this.deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
          profileSnapshot,
        );

      await signInFallback();

      if (!profiloOspiteEliminato) {
        await this.deleteProfileSnapshotIfAnonymous(profileSnapshot);
      }

      return true;
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
    }

    const shouldSwitch = await this.confirmExistingProviderSwitch(
      AUTH_CONFIG.providers.playGames,
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

  // Chiede conferma prima di passare a un provider che ha già un profilo.
  private async confirmExistingProviderSwitch(
    providerId: AppAuthProviderId,
  ): Promise<boolean> {
    return this.authAccountLinkService.confirmExistingProviderSwitch(
      providerId,
    );
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
}
