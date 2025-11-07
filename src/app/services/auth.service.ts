import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  User,
  onAuthStateChanged,
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { environment } from 'src/environments/environment';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';

// ✅ Inizializza Firebase app una sola volta
const app = initializeApp(environment.firebase);
const auth = getAuth(app);

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  constructor() {
    // ✅ Monitora sempre lo stato dell’utente
    onAuthStateChanged(auth, (user) => {
      this.userSubject.next(user);
      if (user) console.log('👤 Utente loggato:', user.email);
      else console.log('🚪 Nessun utente autenticato');
    });
  }

  async googleSignIn() {
    try {
      if (Capacitor.getPlatform() === 'web') {
        // 🌐 Login Google per browser (fallback)
        const provider = new GoogleAuthProvider();
        const userCredential = await import('firebase/auth').then(
          ({ signInWithPopup }) => signInWithPopup(auth, provider)
        );
        this.userSubject.next(userCredential.user);
        console.log('✅ Accesso completato via web:', userCredential.user);
        return;
      }

      console.log('🚀 Avvio login con Google su Android...');
      const result = await FirebaseAuthentication.signInWithGoogle();

      if (result.credential?.idToken) {
        console.log('🧩 Token Google ricevuto, creo credenziale Firebase...');
        const credential = GoogleAuthProvider.credential(
          result.credential.idToken
        );
        const userCredential = await signInWithCredential(auth, credential);
        this.userSubject.next(userCredential.user);
        console.log('✅ Accesso completato:', userCredential.user);
      } else {
        console.warn('⚠️ Nessun token Google ricevuto dal plugin');
      }
    } catch (error: any) {
      console.error('❌ Errore durante il login con Google:', error);
      alert('Errore durante il login con Google.\n' + (error.message || error));
    }
  }

  async logout() {
    try {
      await FirebaseAuthentication.signOut();
      await signOut(auth);
      this.userSubject.next(null);
      console.log('👋 Logout completato.');
    } catch (error) {
      console.error('❌ Errore durante il logout:', error);
    }
  }
}
