import { Component } from '@angular/core';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(private platform: Platform, private auth: AuthService) {
    this.initializeApp();
  }

  async initializeApp() {
    await this.platform.ready();
    console.log('✅ App avviata');

    const isMobile = Capacitor.getPlatform() !== 'web';
    console.log(isMobile ? '📱 Piattaforma mobile' : '💻 Web/PWA');

    console.log('🧩 Ionic components definiti correttamente');
  }
}
