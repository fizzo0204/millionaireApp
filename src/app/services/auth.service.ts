import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  signInAnonymously,
  onAuthStateChanged,
  User,
  linkWithCredential,
  Auth,
  AuthCredential,
  signInWithPopup,
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { environment } from 'src/environments/environment';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const app = initializeApp(environment.firebase);
const auth: Auth = getAuth(app);

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  isLoading$ = this.loadingSubject.asObservable();

  private initialAuthResolved = false;

  constructor() {
    onAuthStateChanged(auth, async (user) => {
      console.log(
        '👤 Stato auth cambiato →',
        user?.displayName || (user?.isAnonymous ? 'Anonimo' : 'null'),
      );

      this.userSubject.next(user);

      if (!this.initialAuthResolved) {
        this.initialAuthResolved = true;

        if (!user) {
          console.log('🚪 Nessun utente → creo accesso anonimo...');
          const anon = await signInAnonymously(auth);
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
      const isMobile = (window as any).Capacitor?.isNativePlatform?.() ?? false;

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
        const result = await signInWithPopup(auth, provider);
        credential = GoogleAuthProvider.credentialFromResult(result);
      }

      if (!credential) {
        throw new Error('❌ Credenziale non valida');
      }

      const currentUser = auth.currentUser;

      if (currentUser && currentUser.isAnonymous) {
        console.log('🔗 Provo a collegare account anonimo a Google...');
        try {
          await linkWithCredential(currentUser, credential);
          console.log('✅ Account anonimo collegato a Google');
        } catch (err: any) {
          if (err.code === 'auth/credential-already-in-use') {
            console.warn('⚠️ Account Google già esistente → login diretto');
            await signInWithCredential(auth, credential);
          } else {
            throw err;
          }
        }
      } else {
        await signInWithCredential(auth, credential);
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

  async logout(): Promise<void> {
    this.loadingSubject.next(true);

    try {
      console.log('👋 Effettuo logout...');

      await FirebaseAuthentication.signOut();
      await auth.signOut();

      console.log('⚪ Creo nuovo utente anonimo dopo logout...');
      const anon = await signInAnonymously(auth);

      console.log('🙈 Nuovo utente anonimo generato.');
      this.userSubject.next(anon.user);
    } catch (err) {
      console.error('❌ Errore durante logout:', err);
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
