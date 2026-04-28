import { Component } from '@angular/core';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { AuthService } from './services/auth.service';

import { HomeNavbarComponent } from './components/home-navbar/home-navbar.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';
import { AudioService } from './services/audio';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonicModule, CommonModule, HomeNavbarComponent, BottomNavComponent],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  activeTab = 'home';

  constructor(
    private platform: Platform,
    private auth: AuthService,
    private audioService: AudioService,
  ) {
    this.initializeApp();
  }

  async initializeApp() {
    await this.platform.ready();
    console.log('✅ App avviata');

    const isMobile = Capacitor.getPlatform() !== 'web';
    console.log(isMobile ? '📱 Piattaforma mobile' : '💻 Web/PWA');

    console.log('🧩 Ionic components definiti correttamente');

    // 🎵 audio
    this.audioService.initHomeMusic();
    this.audioService.playMusic();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  async playMusic() {
    await this.audioService.playMusic();
  }

  async handleGlobalClick() {
    await this.audioService.playMusic();
    this.audioService.playClick();
  }
}
