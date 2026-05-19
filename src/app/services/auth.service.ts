import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  signInWithCredential,
  GoogleAuthProvider,
  signInAnonymously,
  onAuthStateChanged,
  User,
  linkWithCredential,
  AuthCredential,
  signInWithPopup,
  FacebookAuthProvider,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { UserStatsService } from './user-stats.service';
import { firebaseAuth } from 'src/app/config/firebase.config';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  user$ = this.userSubject.asObservable();
  isLoading$ = this.loadingSubject.asObservable();

  private initialAuthResolved = false;

  constructor(private userStatsService: UserStatsService) {
    onAuthStateChanged(firebaseAuth, async (user) => {
      console.log(
        '👤 Stato auth cambiato →',
        user?.displayName || (user?.isAnonymous ? 'Anonimo' : 'null'),
      );

      this.userSubject.next(user);
      if (user && !user.isAnonymous) {
        await this.userStatsService.ensureUserProfile(user);
      }

      if (!this.initialAuthResolved) {
        this.initialAuthResolved = true;

        if (!user) {
          console.log('🚪 Nessun utente → creo accesso anonimo...');
          const anon = await signInAnonymously(firebaseAuth);
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

      let credential: AuthCredential | null = null;

      if (isMobile) {
        console.log(
          '📱 Login Google tramite Capacitor FirebaseAuthentication...',
        );
        const result = await FirebaseAuthentication.signInWithGoogle();

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

      const currentUser = firebaseAuth.currentUser;

      if (currentUser && currentUser.isAnonymous) {
        console.log('🔗 Provo a collegare account anonimo a Google...');
        try {
          await linkWithCredential(currentUser, credential);
          console.log('✅ Account anonimo collegato a Google');
        } catch (err: any) {
          if (err.code === 'auth/credential-already-in-use') {
            console.warn('⚠️ Account Google già esistente → login diretto');
            await signInWithCredential(firebaseAuth, credential);
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

      let credential: AuthCredential | null = null;

      if (isMobile) {
        console.log(
          '📱 Login Facebook tramite Capacitor FirebaseAuthentication...',
        );
        const result = await FirebaseAuthentication.signInWithFacebook();

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

      const currentUser = firebaseAuth.currentUser;

      if (currentUser && currentUser.isAnonymous) {
        console.log('🔗 Provo a collegare account anonimo a Facebook...');
        try {
          await linkWithCredential(currentUser, credential);
          console.log('✅ Account anonimo collegato a Facebook');
        } catch (err: any) {
          if (err.code === 'auth/credential-already-in-use') {
            console.warn('⚠️ Account Facebook già esistente → login diretto');
            await signInWithCredential(firebaseAuth, credential);
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

      console.log('🙈 Nuovo utente anonimo generato.');
      this.userSubject.next(anon.user);
    } catch (err) {
      console.error('❌ Errore durante logout:', err);
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
