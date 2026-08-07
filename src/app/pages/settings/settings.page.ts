import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { User } from 'firebase/auth';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { LogoutConfirmModalComponent } from 'src/app/components/logout-confirm-modal/logout-confirm-modal.component';
import { DeleteAccountConfirmModalComponent } from 'src/app/components/delete-account-confirm-modal/delete-account-confirm-modal.component';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { AuthService } from 'src/app/services/auth.service';
import { AudioService } from 'src/app/services/audio';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AuthPromptService } from 'src/app/services/auth-prompt.service';
import { LogoutDecision } from 'src/app/models/logout.model';
import { AccountDeletionDecision } from 'src/app/models/account-deletion.model';
import { environment } from 'src/environments/environment';
import { TutorialService } from 'src/app/services/tutorial.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';
import { AdminUsersService } from 'src/app/services/admin-users.service';

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
  arcadeResetLoading = false;
  deleteAccountLoading = false;
  eventsDebugLoading = false;
  eventsDebugWeekday: number | null = null;
  readonly isDebugMode = !environment.production;
  readonly eventDebugWeekdays = [
    { value: 1, label: 'Lun' },
    { value: 2, label: 'Mar' },
    { value: 3, label: 'Mer' },
    { value: 4, label: 'Gio' },
    { value: 5, label: 'Ven' },
    { value: 6, label: 'Sab' },
    { value: 0, label: 'Dom' },
  ];

  constructor(
    private audioService: AudioService,
    private authService: AuthService,
    private navigation: NavigationTransitionService,
    private userStatsService: UserStatsService,
    private dailyRewardService: DailyRewardService,
    private authPromptService: AuthPromptService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private tutorialService: TutorialService,
    private dailyEventsService: DailyEventsService,
    private adminUsersService: AdminUsersService,
  ) {
    this.musicEnabled = this.audioService.isMusicEnabled();
    this.clickEnabled = this.audioService.isClickEnabled();
    this.eventsDebugWeekday = this.dailyEventsService.getDebugWeekday();
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

  isAdmin(user: User | null): boolean {
    return this.adminUsersService.isAdminUser(user);
  }

  async openAdminPanel(): Promise<void> {
    await this.navigation.navigateByUrl('/admin-users');
  }

  // L'eliminazione account riguarda solo profili con un accesso reale,
  // non l'ospite anonimo (che ha già il reset debug per ripartire da zero).
  shouldShowDeleteAccount(user: User | null): boolean {
    return !!user && !user.isAnonymous;
  }

  async logout() {
    const decision = await this.confirmLogout();

    if (decision === 'cancel') return;

    await this.authService.logout();
    await this.navigation.navigateByUrl('/home');
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

  async deleteAccount() {
    if (this.deleteAccountLoading) return;

    const decision = await this.confirmDeleteAccount();

    if (decision === 'cancel') return;

    this.deleteAccountLoading = true;

    try {
      const result = await this.authService.deleteAccount();

      if (result === 'success') {
        await this.navigation.navigateByUrl('/home');
        await this.showToast('Account eliminato. Ora sei un nuovo ospite.');
        return;
      }

      if (result === 'requires-recent-login') {
        alert(
          'Per motivi di sicurezza devi aver eseguito l\'accesso di recente. Esegui il logout, accedi di nuovo e riprova.',
        );
        return;
      }

      alert('Errore durante l\'eliminazione dell\'account. Riprova.');
    } finally {
      this.deleteAccountLoading = false;
    }
  }

  private async confirmDeleteAccount(): Promise<AccountDeletionDecision> {
    const modal = await this.modalCtrl.create({
      component: DeleteAccountConfirmModalComponent,
      cssClass: 'delete-account-confirm-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const result = await modal.onDidDismiss<AccountDeletionDecision>();

    return result.data ?? 'cancel';
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2600,
      position: 'bottom',
    });

    await toast.present();
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

  async resetArcadeDebug() {
    if (this.arcadeResetLoading) return;

    const confirmed = confirm(
      'Vuoi azzerare solo la Scalata e ripartire dal livello 1?',
    );

    if (!confirmed) return;

    this.arcadeResetLoading = true;

    try {
      const user = await firstValueFrom(this.authService.user$);

      if (!user) {
        alert('Nessun utente valido trovato');
        return;
      }

      await this.userStatsService.resetArcadeDebugData(user.uid);
      alert('Scalata resettata: riparti dal livello 1');
    } catch (error) {
      console.error('Errore reset scalata:', error);
      alert('Errore durante il reset della scalata');
    } finally {
      this.arcadeResetLoading = false;
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

  async resetDailyEventsDebug() {
    if (this.eventsDebugLoading) return;

    const confirmed = confirm(
      'Vuoi resettare missioni, ruota e sfida giornaliera di oggi?',
    );

    if (!confirmed) return;

    this.eventsDebugLoading = true;

    try {
      await this.dailyEventsService.resetDailyEventsDebug();
      alert('Eventi giornalieri resettati');
    } catch (error) {
      console.error('Errore reset eventi giornalieri:', error);
      alert('Errore durante il reset eventi');
    } finally {
      this.eventsDebugLoading = false;
    }
  }

  async setEventsDebugWeekday(weekday: number | null) {
    if (this.eventsDebugLoading) return;

    this.eventsDebugLoading = true;

    try {
      await this.dailyEventsService.setDebugWeekday(weekday);
      this.eventsDebugWeekday = this.dailyEventsService.getDebugWeekday();
    } catch (error) {
      console.error('Errore cambio giorno eventi:', error);
      alert('Errore durante il cambio giorno eventi');
    } finally {
      this.eventsDebugLoading = false;
    }
  }
}
