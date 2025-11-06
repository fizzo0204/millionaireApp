import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(private platform: Platform) {
    this.platform.ready().then(() => {
      console.log('✅ App avviata');

      if (Capacitor.getPlatform() !== 'web') {
        GoogleAuth.initialize({
          clientId:
            '419647253271-kohvq0q3git46j9me69clkd5p15r77n0.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
        console.log('✅ GoogleAuth inizializzato');
      }
    });
  }
}
