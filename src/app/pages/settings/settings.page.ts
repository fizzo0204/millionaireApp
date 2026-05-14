import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { AuthService } from 'src/app/services/auth.service';
import { AudioService } from 'src/app/services/audio';
import { UserStatsService } from 'src/app/services/user-stats.service';

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
  resetLoading = false;

  constructor(
    private audioService: AudioService,
    private authService: AuthService,
    private router: Router,
    private userStatsService: UserStatsService,
    private dailyRewardService: DailyRewardService,
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

  async resetDebugData() {
    if (this.resetLoading) return;

    const confirmed = confirm(
      'Vuoi davvero resettare progressi, XP, livelli, monete, vite e cronologia?',
    );

    if (!confirmed) return;

    this.resetLoading = true;

    try {
      const user = await firstValueFrom(this.authService.user$);

      if (!user || user.isAnonymous) {
        alert('Nessun utente valido trovato');
        return;
      }

      await this.userStatsService.resetUserDebugData(user.uid);

      alert('Dati reset completato');
    } catch (error) {
      console.error('Errore reset debug:', error);
      alert('Errore durante il reset');
    } finally {
      this.resetLoading = false;
    }
  }

  resetDailyReward() {
    this.dailyRewardService.resetDailyReward();
    console.log('Daily reset:', this.dailyRewardService.getState());
  }
}
