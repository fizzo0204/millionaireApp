import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { AudioService } from 'src/app/services/audio';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  musicEnabled = true;

  constructor(
    private audioService: AudioService,
    private authService: AuthService,
  ) {
    this.musicEnabled = this.audioService.isMusicEnabled();
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    this.audioService.setMusicEnabled(this.musicEnabled);
  }

  logout() {
    this.authService.logout();
  }
}
