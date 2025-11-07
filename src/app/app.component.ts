import { Component } from '@angular/core';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(private platform: Platform) {
    this.initializeApp();
  }

  async initializeApp() {
    await this.platform.ready();
    console.log('✅ App avviata');

    try {
      // Inizializza Firebase
      const app = initializeApp(environment.firebase);
      const auth = getAuth(app);

      // Logga automaticamente se l’utente è già autenticato
      onAuthStateChanged(auth, (user) => {
        if (user) {
          console.log('👤 Utente autenticato:', user.displayName);
        } else {
          console.log('🚪 Nessun utente loggato');
        }
      });

      console.log('🔥 Firebase Auth inizializzato correttamente');
    } catch (err) {
      console.error('❌ Errore inizializzazione Firebase Auth:', err);
    }

    if (
      Capacitor.getPlatform() === 'android' ||
      Capacitor.getPlatform() === 'ios'
    ) {
      console.log('📱 App in esecuzione su piattaforma mobile');
    } else {
      console.log('💻 App in esecuzione su web/PWA');
    }
  }
}
