import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { User } from 'firebase/auth';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { LogoutConfirmModalComponent } from 'src/app/components/logout-confirm-modal/logout-confirm-modal.component';
import { DeleteAccountConfirmModalComponent } from 'src/app/components/delete-account-confirm-modal/delete-account-confirm-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import { AudioService } from 'src/app/services/audio';
import { AuthPromptService } from 'src/app/services/auth-prompt.service';
import { LogoutDecision } from 'src/app/models/logout.model';
import { AccountDeletionDecision } from 'src/app/models/account-deletion.model';
import {
  LOGOUT_CONFIRM_MODAL_ID,
  DELETE_ACCOUNT_CONFIRM_MODAL_ID,
} from 'src/app/config/modal-ids.config';
import { TutorialService } from 'src/app/services/tutorial.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';
import { AdminUsersService } from 'src/app/services/admin-users.service';
import { AdsService } from 'src/app/services/ads.service';
import { NotificationsService } from 'src/app/services/notifications.service';
import { LEGAL_CONFIG } from 'src/app/config/legal.config';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  user$ = this.authService.user$;
  shouldOfferAccountLink$ = this.authService.shouldOfferAccountLink$;

  musicEnabled = true;
  clickEnabled = true;
  notificationsEnabled = true;
  deleteAccountLoading = false;
  logoutLoading = false;
  readonly privacyPolicyUrl = LEGAL_CONFIG.privacyPolicyUrl;
  readonly privacyOptionsRequired$ = this.adsService.privacyOptionsRequired$;

  constructor(
    private audioService: AudioService,
    private authService: AuthService,
    private navigation: NavigationTransitionService,
    private authPromptService: AuthPromptService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private tutorialService: TutorialService,
    private adminUsersService: AdminUsersService,
    private adsService: AdsService,
    private notificationsService: NotificationsService,
  ) {
    this.musicEnabled = this.audioService.isMusicEnabled();
    this.clickEnabled = this.audioService.isClickEnabled();
    this.notificationsEnabled = this.notificationsService.isEnabled();
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    this.audioService.setMusicEnabled(this.musicEnabled);
  }

  toggleClick() {
    this.clickEnabled = !this.clickEnabled;
    this.audioService.setClickEnabled(this.clickEnabled);
  }

  toggleNotifications() {
    this.notificationsEnabled = !this.notificationsEnabled;
    this.notificationsService.setEnabled(this.notificationsEnabled);

    if (this.notificationsEnabled) {
      void this.notificationsService.scheduleAll();
    } else {
      void this.notificationsService.cancelAll();
    }
  }

  isAdmin(user: User | null): boolean {
    return this.adminUsersService.isAdminUser(user);
  }

  async openAdminPanel(): Promise<void> {
    await this.navigation.navigateByUrl('/admin-users');
  }

  // L'eliminazione account riguarda solo profili con un accesso reale, non l'ospite anonimo.
  shouldShowDeleteAccount(user: User | null): boolean {
    return !!user && !user.isAnonymous;
  }

  async logout() {
    /*
     * Il flag va impostato PRIMA di aprire la modale di conferma (che è
     * async: modalCtrl.create()+present() impiegano qualche istante), non
     * dopo che l'utente ha già deciso: altrimenti un doppio tap sul bottone
     * arriva prima che [disabled] abbia effetto e impila due modali di
     * conferma, la seconda delle quali resta bloccata a schermo (stesso
     * pattern del bug già risolto per la daily-reward-modal).
     */
    if (this.logoutLoading) return;

    this.logoutLoading = true;

    try {
      const decision = await this.confirmLogout();

      if (decision === 'cancel') return;

      await this.authService.logout();
      await this.navigation.navigateByUrl('/home');
    } finally {
      this.logoutLoading = false;
    }
  }

  private async confirmLogout(): Promise<LogoutDecision> {
    const modal = await this.modalCtrl.create({
      id: LOGOUT_CONFIRM_MODAL_ID,
      component: LogoutConfirmModalComponent,
      cssClass: 'logout-confirm-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const result = await modal.onDidDismiss<LogoutDecision>();

    return result.data ?? 'cancel';
  }

  async deleteAccount() {
    /*
     * Stesso motivo del guard in logout(): il flag va impostato PRIMA di
     * aprire la modale di conferma (async), non dopo che l'utente ha già
     * deciso — [disabled] da solo non basta contro un doppio tap arrivato
     * prima che si aggiorni.
     */
    if (this.deleteAccountLoading) return;

    this.deleteAccountLoading = true;

    try {
      const decision = await this.confirmDeleteAccount();

      if (decision === 'cancel') return;

      const result = await this.authService.deleteAccount();

      /*
       * 'success-partial': i dati sono stati cancellati ma l'account Auth
       * originale no (vedi AuthService.deleteAccount). Per l'utente
       * l'esperienza e' identica a 'success' (nuovo profilo ospite pulito),
       * quindi mostriamo lo stesso messaggio invece di un dettaglio tecnico
       * che non può comunque risolvere da qui.
       */
      if (result === 'success' || result === 'success-partial') {
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
      id: DELETE_ACCOUNT_CONFIRM_MODAL_ID,
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

  async openPrivacyOptions() {
    await this.adsService.openPrivacyOptionsForm();
  }
}
