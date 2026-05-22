import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import {
  signInWithCredential,
  GoogleAuthProvider,
  signInAnonymously,
  onAuthStateChanged,
  User,
  linkWithCredential,
  linkWithPopup,
  AuthCredential,
  updateProfile,
  signInWithPopup,
  FacebookAuthProvider,
  getAuth as getFirebaseAuth,
  signOut as signOutFirebaseAuth,
} from 'firebase/auth';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  collection as firestoreCollection,
  doc as firestoreDoc,
  getDoc as getFirestoreDoc,
  getDocs as getFirestoreDocs,
  getFirestore as getFirebaseFirestore,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { UserStatsService } from './user-stats.service';
import { firebaseAuth } from 'src/app/config/firebase.config';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import {
  AppAuthProviderId,
  ProviderProfileMetadata,
} from 'src/app/models/auth.model';
import { AccountLinkService } from './account-link.service';
import { PlayGamesAuthService } from './play-games-auth.service';
import { environment } from 'src/environments/environment';
import { UserProfileMigrationSnapshot } from 'src/app/models/user-stats.model';

interface ExistingProviderProfileState {
  uid: string;
  hasSavedProgress: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  user$ = this.userSubject.asObservable();
  isLoading$ = this.loadingSubject.asObservable();

  private initialAuthResolved = false;

  constructor(
    private userStatsService: UserStatsService,
    private accountLinkService: AccountLinkService,
    private playGamesAuthService: PlayGamesAuthService,
  ) {
    onAuthStateChanged(firebaseAuth, async (user) => {
      console.log(
        '👤 Stato auth cambiato →',
        user?.displayName || (user?.isAnonymous ? 'Anonimo' : 'null'),
      );

      if (user) {
        /*
         * Ogni utente Firebase diventa un profilo giocabile.
         * Anche l'anonimo ha un UID stabile, quindi puo salvare progressi,
         * monete, vite e reward in Firestore fino a quando non collega un account.
         */
        await this.userStatsService.ensureUserProfile(user);
        await this.hydrateStoredPlayGamesProfile(user);
      }

      this.userSubject.next(user);

      if (!this.initialAuthResolved) {
        this.initialAuthResolved = true;

        if (!user) {
          const playGamesUser = await this.playGamesAuthService.tryAutoSignIn();

          if (playGamesUser) {
            this.userSubject.next(playGamesUser);
            return;
          }

          console.log('🚪 Nessun utente → creo accesso anonimo...');
          const anon = await signInAnonymously(firebaseAuth);
          await this.userStatsService.ensureUserProfile(anon.user);
          this.userSubject.next(anon.user);
          console.log('🙈 Accesso anonimo creato');
        }
      }
    });
  }

  async googleSignIn(): Promise<boolean> {
    this.loadingSubject.next(true);

    try {
      console.log('🔹 Avvio login Google...');
      const isMobile = Capacitor.isNativePlatform();
      const currentUser = firebaseAuth.currentUser;

      if (!isMobile && currentUser?.isAnonymous) {
        const provider = new GoogleAuthProvider();

        try {
          const linkedUser = await linkWithPopup(currentUser, provider);
          await this.completeCurrentProfileAccountLink(linkedUser.user);
          console.log('Profilo corrente collegato a Google');
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
        console.log(
          '📱 Login Google tramite Capacitor FirebaseAuthentication...',
        );
        const result = await FirebaseAuthentication.signInWithGoogle({
          /*
           * Il plugin recupera solo il token Google.
           * Il link vero resta nel Firebase JS SDK, cosi l'ospite mantiene UID,
           * coins, daily reward e progressi quando l'account Google e nuovo.
           */
          skipNativeAuth: true,
        });

        if (!result.credential?.idToken) {
          throw new Error('❌ Nessun token Google ricevuto dal plugin');
        }

        credential = GoogleAuthProvider.credential(result.credential.idToken);
      } else {
        console.log('💻 Login Google tramite popup web...');
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
        console.log('🔗 Provo a collegare profilo corrente a Google...');
        try {
          /*
           * Firebase non crea due utenti: il profilo corrente viene promosso
           * allo stesso UID Google. Non dobbiamo cancellarlo, altrimenti
           * cancelleremmo anche l'account appena collegato.
           */
          const linkedUser = await linkWithCredential(currentUser!, credential);
          await this.completeCurrentProfileAccountLink(linkedUser.user);
          console.log('✅ Profilo corrente collegato a Google');
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

      console.log('✅ Accesso Google completato.');
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
      console.log('🔹 Avvio login Facebook...');
      const isMobile = Capacitor.isNativePlatform();
      const currentUser = firebaseAuth.currentUser;

      if (!isMobile && currentUser?.isAnonymous) {
        const provider = new FacebookAuthProvider();
        provider.addScope('public_profile');

        try {
          const linkedUser = await linkWithPopup(currentUser, provider);
          await this.completeCurrentProfileAccountLink(linkedUser.user);
          console.log('Profilo corrente collegato a Facebook');
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
        console.log(
          '📱 Login Facebook tramite Capacitor FirebaseAuthentication...',
        );
        const result = await FirebaseAuthentication.signInWithFacebook({
          /*
           * Come per Google: otteniamo solo il token e poi decidiamo noi
           * se collegarlo all'ospite o caricare un account Facebook esistente.
           */
          skipNativeAuth: true,
        });

        if (!result.credential?.accessToken) {
          throw new Error('❌ Nessun accessToken Facebook ricevuto dal plugin');
        }

        credential = FacebookAuthProvider.credential(
          result.credential.accessToken,
        );
      } else {
        console.log('💻 Login Facebook tramite popup web...');
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
        console.log('🔗 Provo a collegare profilo corrente a Facebook...');
        try {
          /*
           * Stesso comportamento di Google: il profilo corrente diventa account Facebook
           * mantenendo UID e progressi, quindi non esiste un anonimo separato.
           */
          const linkedUser = await linkWithCredential(currentUser!, credential);
          await this.completeCurrentProfileAccountLink(linkedUser.user);
          console.log('✅ Profilo corrente collegato a Facebook');
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

      console.log('✅ Accesso Facebook completato.');
      return true;
    } catch (error) {
      console.error('❌ Errore login Facebook:', error);
      return false;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async playGamesSignIn(): Promise<boolean> {
    this.loadingSubject.next(true);

    try {
      console.log('Avvio collegamento Play Games...');

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
        console.log('Provo a collegare profilo corrente a Play Games...');

        try {
          /*
           * Quando l'ospite sceglie Play Games, proviamo a promuovere lo stesso
           * UID Firebase. In questo modo coins, daily reward e livelli restano
           * nello stesso documento Firestore.
           */
          const linkedUser = await linkWithCredential(
            currentUser!,
            playGamesResult.credential,
          );
          await this.completeCurrentProfileAccountLink(
            linkedUser.user,
            AUTH_CONFIG.providers.playGames,
            playGamesResult.profile,
          );
          console.log('Profilo corrente collegato a Play Games');
        } catch (err: any) {
          if (this.isCredentialAlreadyInUseError(err)) {
            const signedIn = await this.handleExistingPlayGamesProfile();

            if (!signedIn) return false;
          } else {
            throw err;
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

      console.log('Accesso Play Games completato.');
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
      console.log('👋 Effettuo logout...');

      await FirebaseAuthentication.signOut();
      await firebaseAuth.signOut();

      console.log('⚪ Creo nuovo utente anonimo dopo logout...');
      const anon = await signInAnonymously(firebaseAuth);
      await this.userStatsService.ensureUserProfile(anon.user);

      console.log('🙈 Nuovo utente anonimo generato.');
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

    if (linkedProviderId === AUTH_CONFIG.providers.playGames) {
      /*
       * Play Games passa da una credenziale custom: questo rende esplicito in
       * Firestore che il profilo base non e piu anonimo.
       */
      await this.applyProviderProfileMetadata(user, providerProfile);
      await this.userStatsService.markPlayGamesProfile(
        user.uid,
        providerProfile,
      );
    }

    try {
      await user.reload();
    } catch {
      // Se Firebase non ricarica subito il provider, la UI usera il fallback Firestore.
    }

    this.userSubject.next(firebaseAuth.currentUser ?? user);
  }

  canConnectPlayGames(user: User | null): boolean {
    /*
     * Il bottone manuale Play Games serve solo agli ospiti Android.
     * Chi e gia Play Games deve vedere Google/Facebook come collegamento forte.
     */
    return this.playGamesAuthService.canUsePlayGames && Boolean(user?.isAnonymous);
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

      if (existingProfileState && !existingProfileState.hasSavedProgress) {
        /*
         * Caso importante: Google/Facebook esiste gia in Firebase Auth, ma
         * TurtleMind non ha progressi salvati per quel profilo. Non mostriamo
         * la modale di conflitto: importiamo direttamente il profilo corrente.
         */
        console.warn(
          'Account Auth esistente senza progressi TurtleMind: importo profilo corrente',
        );

        const signedInUser = await signInWithCredential(
          firebaseAuth,
          credential,
        );

        await this.userStatsService.restoreProfileSnapshotIntoLinkedAccount(
          signedInUser.user,
          profileSnapshot,
        );

        await this.syncSignedInProviderProfile(
          signedInUser.user,
          providerId,
        );

        await this.userStatsService.deleteUserProfileData(profileSnapshot.uid);

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
      const signedInUser = await signInWithCredential(firebaseAuth, credential);

      await this.syncSignedInProviderProfile(signedInUser.user, providerId);

      if (profileSnapshot && profileSnapshot.uid !== signedInUser.user.uid) {
        await this.userStatsService.deleteUserProfileData(profileSnapshot.uid);
      }

      return true;
    }

    if (signInFallback) {
      await signInFallback();

      if (profileSnapshot) {
        await this.userStatsService.deleteUserProfileData(profileSnapshot.uid);
      }

      return true;
    }

    return false;
  }

  private async handleExistingPlayGamesProfile(): Promise<boolean> {
    /*
     * Il serverAuthCode di Play Games puo essere monouso. Se il link fallisce
     * perche quel Play Games esiste gia, non riusiamo la credenziale appena
     * consumata: chiediamo conferma e poi otteniamo un token fresco.
     */
    const profileSnapshot = await this.createCurrentProfileSnapshot();
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

    const signedInUser = await signInWithCredential(
      firebaseAuth,
      freshPlayGamesResult.credential,
    );

    await this.syncSignedInProviderProfile(
      signedInUser.user,
      AUTH_CONFIG.providers.playGames,
      freshPlayGamesResult.profile,
    );

    if (profileSnapshot && profileSnapshot.uid !== signedInUser.user.uid) {
      await this.userStatsService.deleteUserProfileData(profileSnapshot.uid);
    }

    return true;
  }

  private async syncSignedInProviderProfile(
    user: User,
    providerId: AppAuthProviderId,
    providerProfile?: ProviderProfileMetadata,
  ): Promise<void> {
    /*
     * Dopo un sign-in diretto allineiamo il documento Firestore al provider
     * reale. Per Play Games serve un marker esplicito per distinguerlo
     * dall'ospite anonimo e mostrare la UI corretta.
     */
    await this.userStatsService.ensureUserProfile(user);

    if (providerId === AUTH_CONFIG.providers.playGames) {
      await this.applyProviderProfileMetadata(user, providerProfile);
      await this.userStatsService.markPlayGamesProfile(
        user.uid,
        providerProfile,
      );
    }

    try {
      await user.reload();
    } catch {
      // Non blocchiamo il flusso: Firestore contiene gia il provider corretto.
    }

    this.userSubject.next(firebaseAuth.currentUser ?? user);
  }

  private async applyProviderProfileMetadata(
    user: User,
    providerProfile?: ProviderProfileMetadata,
  ): Promise<void> {
    /*
     * Nel link anonimo -> Play Games Firebase mantiene lo stesso utente.
     * A volte pero non copia subito displayName/photoURL dal provider, quindi
     * li applichiamo noi quando il plugin nativo ce li restituisce.
     */
    if (!providerProfile?.displayName && !providerProfile?.photoURL) return;

    try {
      await updateProfile(user, {
        displayName: providerProfile.displayName ?? user.displayName,
        photoURL: providerProfile.photoURL ?? user.photoURL,
      });
    } catch (error) {
      console.warn('Profilo Firebase non aggiornato con dati provider:', error);
    }
  }

  private async hydrateStoredPlayGamesProfile(user: User): Promise<void> {
    /*
     * Recupera il nickname per profili Play Games creati quando ancora non lo
     * salvavamo. Lo facciamo solo per Play Games puro e solo se manca il nome,
     * cosi non disturbiamo gli account Google/Facebook.
     */
    if (!this.playGamesAuthService.canUsePlayGames) return;

    const profile = await firstValueFrom(
      this.userStatsService.getUserProfile(user.uid),
    );
    const providerIds = profile?.auth?.providerIds ?? [];
    const isPurePlayGames =
      providerIds.includes(AUTH_CONFIG.providers.playGames) &&
      !providerIds.includes(AUTH_CONFIG.providers.google) &&
      !providerIds.includes(AUTH_CONFIG.providers.facebook);

    if (!isPurePlayGames || profile?.displayName) return;

    try {
      const providerProfile =
        await this.playGamesAuthService.getNativePlayGamesProfile();

      if (!providerProfile?.displayName && !providerProfile?.photoURL) {
        return;
      }

      await this.applyProviderProfileMetadata(user, providerProfile);
      await this.userStatsService.markPlayGamesProfile(
        user.uid,
        providerProfile,
      );
      this.userSubject.next(firebaseAuth.currentUser ?? user);
    } catch (error) {
      console.warn('Nickname Play Games non recuperato:', error);
    }
  }

  private async createCurrentProfileSnapshot(): Promise<
    UserProfileMigrationSnapshot | null
  > {
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

  private async getExistingProviderProfileState(
    credential: AuthCredential,
  ): Promise<ExistingProviderProfileState | null> {
    /*
     * Controlliamo l'account esistente con una Firebase app temporanea.
     * Cosi non tocchiamo l'utente anonimo attuale mentre decidiamo se esiste
     * davvero un profilo di gioco da proteggere con la modale.
     */
    const tempAppName = `provider-profile-check-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const tempApp = initializeApp(environment.firebase, tempAppName);
    const tempAuth = getFirebaseAuth(tempApp);

    try {
      const existingUser = await signInWithCredential(tempAuth, credential);
      const tempFirestore = getFirebaseFirestore(tempApp);
      const userRef = firestoreDoc(
        tempFirestore,
        `users/${existingUser.user.uid}`,
      );
      const profileSnapshot = await getFirestoreDoc(userRef);
      let hasSubcollectionData = false;

      for (const collectionName of this.userStatsService
        .progressSubcollectionNames) {
        const collectionRef = firestoreCollection(
          tempFirestore,
          `users/${existingUser.user.uid}/${collectionName}`,
        );
        const collectionSnapshot = await getFirestoreDocs(collectionRef);

        if (!collectionSnapshot.empty) {
          hasSubcollectionData = true;
          break;
        }
      }

      return {
        uid: existingUser.user.uid,
        hasSavedProgress: this.userStatsService.hasMeaningfulSavedProgress(
          profileSnapshot.exists() ? profileSnapshot.data() : null,
          hasSubcollectionData,
        ),
      };
    } catch (error) {
      /*
       * Se non riusciamo a controllare il profilo in modo affidabile, restiamo
       * conservativi e mostriamo la modale prima di cambiare account.
       */
      console.warn(
        'Non riesco a verificare i progressi del provider esistente',
        error,
      );
      return null;
    } finally {
      try {
        await signOutFirebaseAuth(tempAuth);
      } catch {
        // La app temporanea potrebbe non aver completato il login: va bene cosi.
      }

      try {
        await deleteApp(tempApp);
      } catch {
        // Evita rumore in console se Firebase ha gia pulito la app temporanea.
      }
    }
  }

  private async confirmExistingProviderSwitch(
    providerId: AppAuthProviderId,
  ): Promise<boolean> {
    /*
     * Se Google/Facebook esiste gia, non facciamo merge automatico.
     * L'utente puo caricare il vecchio profilo oppure restare su quello attuale.
     */
    const decision =
      await this.accountLinkService.confirmExistingAccountSwitch(providerId);

    return decision === 'use-existing-profile';
  }
}
