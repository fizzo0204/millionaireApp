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
import { AppAuthProviderId } from 'src/app/models/auth.model';
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
      }

      this.userSubject.next(user);

      if (!this.initialAuthResolved) {
        this.initialAuthResolved = true;

        if (!user) {
          const playGamesSignedIn =
            await this.playGamesAuthService.tryAutoSignIn();

          if (playGamesSignedIn) {
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
          await this.completeAnonymousAccountLink(linkedUser.user);
          console.log('Account anonimo collegato a Google');
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

      if (currentUser && currentUser.isAnonymous) {
        console.log('🔗 Provo a collegare account anonimo a Google...');
        try {
          /*
           * Firebase non crea due utenti: il profilo anonimo viene promosso
           * allo stesso UID Google. Non dobbiamo cancellarlo, altrimenti
           * cancelleremmo anche l'account appena collegato.
           */
          const linkedUser = await linkWithCredential(currentUser, credential);
          await this.completeAnonymousAccountLink(linkedUser.user);
          console.log('✅ Account anonimo collegato a Google');
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
          await this.completeAnonymousAccountLink(linkedUser.user);
          console.log('Account anonimo collegato a Facebook');
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

      if (currentUser && currentUser.isAnonymous) {
        console.log('🔗 Provo a collegare account anonimo a Facebook...');
        try {
          /*
           * Stesso comportamento di Google: l'ospite diventa account Facebook
           * mantenendo UID e progressi, quindi non esiste un anonimo separato.
           */
          const linkedUser = await linkWithCredential(currentUser, credential);
          await this.completeAnonymousAccountLink(linkedUser.user);
          console.log('✅ Account anonimo collegato a Facebook');
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

  private async completeAnonymousAccountLink(user: User): Promise<void> {
    /*
     * Questo e il "merge" corretto per un account nuovo:
     * Firebase mantiene lo stesso UID dell'ospite e aggiunge Google/Facebook.
     * Quindi stats, monete, dailyReward, avatar e sottocollezioni restano gia
     * nello stesso documento Firestore, senza copiare dati tra utenti diversi.
     */
    await this.userStatsService.ensureUserProfile(user);
    await this.userStatsService.mergeCurrentProgressIntoLinkedAccount(user.uid);
    this.userSubject.next(user);
  }

  private async handleExistingProviderCredential(
    providerId: AppAuthProviderId,
    credential: AuthCredential | null,
    signInFallback?: () => Promise<unknown>,
  ): Promise<boolean> {
    const guestSnapshot = await this.createCurrentGuestSnapshot();

    if (credential && guestSnapshot) {
      const existingProfileState =
        await this.getExistingProviderProfileState(credential);

      if (existingProfileState && !existingProfileState.hasSavedProgress) {
        /*
         * Caso importante: Google/Facebook esiste gia in Firebase Auth, ma
         * TurtleMind non ha progressi salvati per quel profilo. Non mostriamo
         * la modale di conflitto: importiamo direttamente l'ospite.
         */
        console.warn(
          'Account Auth esistente senza progressi TurtleMind: importo ospite',
        );

        const signedInUser = await signInWithCredential(
          firebaseAuth,
          credential,
        );

        await this.userStatsService.restoreGuestSnapshotIntoLinkedAccount(
          signedInUser.user,
          guestSnapshot,
        );

        this.userSubject.next(signedInUser.user);
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
      await signInWithCredential(firebaseAuth, credential);
      return true;
    }

    if (signInFallback) {
      await signInFallback();
      return true;
    }

    return false;
  }

  private async createCurrentGuestSnapshot(): Promise<
    UserProfileMigrationSnapshot | null
  > {
    const currentUser = firebaseAuth.currentUser;

    if (!currentUser?.isAnonymous) return null;

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
