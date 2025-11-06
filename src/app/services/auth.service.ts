import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  User,
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { environment } from 'src/environments/environment';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const app = initializeApp(environment.firebase);
const auth = getAuth(app);

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  constructor() {
    auth.onAuthStateChanged((user) => {
      this.userSubject.next(user);
    });
  }

  async googleSignIn() {
    try {
      const googleUser = await GoogleAuth.signIn();
      console.log('✅ Google user:', googleUser);

      const credential = GoogleAuthProvider.credential(
        googleUser.authentication.idToken
      );
      const userCredential = await signInWithCredential(auth, credential);
      this.userSubject.next(userCredential.user);

      console.log('✅ Accesso completato:', userCredential.user);
    } catch (error) {
      console.error('❌ Errore durante il login con Google:', error);
    }
  }

  async logout() {
    await signOut(auth);
    this.userSubject.next(null);
  }
}
