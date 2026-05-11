import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ProgressService } from 'src/app/services/progress.service';
import { AuthService } from 'src/app/services/auth.service';
import { AudioService } from 'src/app/services/audio';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  musicEnabled = true;
  clickEnabled = true;

  constructor(
    private audioService: AudioService,
    private authService: AuthService,
    private router: Router,
    private progressService: ProgressService,
  ) {
    this.musicEnabled = this.audioService.isMusicEnabled();
    this.clickEnabled = this.audioService.isClickEnabled();
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    this.audioService.setMusicEnabled(this.musicEnabled);
  }

  toggleClick() {
    this.clickEnabled = !this.clickEnabled;
    this.audioService.setClickEnabled(this.clickEnabled);
  }

  async logout() {
    await this.authService.logout();
    await this.router.navigateByUrl('/home');
  }
}
