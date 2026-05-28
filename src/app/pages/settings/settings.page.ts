import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { User } from 'firebase/auth';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { LogoutConfirmModalComponent } from 'src/app/components/logout-confirm-modal/logout-confirm-modal.component';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { AuthService } from 'src/app/services/auth.service';
import { AudioService } from 'src/app/services/audio';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AuthPromptService } from 'src/app/services/auth-prompt.service';
import { LogoutDecision } from 'src/app/models/logout.model';
import { environment } from 'src/environments/environment';
import { TutorialService } from 'src/app/services/tutorial.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  user$ = this.authService.user$;

  musicEnabled = true;
  clickEnabled = true;
  resetLoading = false;
  readonly isDebugMode = !environment.production;

  constructor(
    private audioService: AudioService,
    private authService: AuthService,
    private router: Router,
    private userStatsService: UserStatsService,
    private dailyRewardService: DailyRewardService,
    private authPromptService: AuthPromptService,
    private modalCtrl: ModalController,
    private tutorialService: TutorialService,
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

  shouldShowLinkAccount(user: User | null): boolean {
    return this.authService.isBaseProfile(user);
  }

  async logout() {
    const decision = await this.confirmLogout();

    if (decision === 'cancel') return;

    await this.authService.logout();
    await this.router.navigateByUrl('/home');
  }

  private async confirmLogout(): Promise<LogoutDecision> {
    const modal = await this.modalCtrl.create({
      component: LogoutConfirmModalComponent,
      cssClass: 'logout-confirm-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const result = await modal.onDidDismiss<LogoutDecision>();

    return result.data ?? 'cancel';
  }

  async openLoginPrompt() {
    await this.authPromptService.openGuestLoginPrompt({
      force: true,
      source: 'settings',
    });
  }

  async openTutorial() {
    await this.tutorialService.openManualTutorial();
  }

  async openFreshTutorialDebug() {
    await this.tutorialService.openDebugFreshTutorial();
  }

  async resetDebugData() {
    if (this.resetLoading) return;

    const confirmed = confirm(
      'Vuoi davvero resettare progressi, XP, livelli, TurtleCoins, vite e cronologia?',
    );

    if (!confirmed) return;

    this.resetLoading = true;

    try {
      const user = await firstValueFrom(this.authService.user$);

      if (!user) {
        alert('Nessun utente valido trovato');
        return;
      }

      // Anche l'ospite anonimo ha dati Firestore, quindi il reset debug funziona.
      await this.userStatsService.resetUserDebugData(user.uid);
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('seen_questions_')) {
          localStorage.removeItem(key);
        }
      });

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

  setDailyDebugDay(day: number) {
    this.dailyRewardService.setDebugDay(day);
  }

  resetDailyAvatars() {
    this.dailyRewardService.resetUnlockedAvatars();
  }
}
