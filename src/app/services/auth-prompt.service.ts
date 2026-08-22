import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import { ANONYMOUS_MODAL_ID } from 'src/app/config/modal-ids.config';
import { AnonymousModalComponent } from 'src/app/components/anonymous-modal/anonymous-modal.component';
import { AuthService } from './auth.service';
import { AppUserProfile } from 'src/app/models/user-stats.model';
import { UserStatsService } from './user-stats.service';

interface LoginPromptOptions {
  force?: boolean;
  source?: 'home' | 'navbar' | 'settings';
}

@Injectable({
  providedIn: 'root',
})
export class AuthPromptService {
  private isPromptOpen = false;

  constructor(
    private modalCtrl: ModalController,
    private auth: AuthService,
    private router: Router,
    private userStatsService: UserStatsService,
  ) {}

  // Apre la modale login solo se l'utente corrente e un profilo base collegabile.
  async openGuestLoginPrompt(options: LoginPromptOptions = {}): Promise<void> {
    if (this.isPromptOpen) return;

    /*
     * Impostato subito, prima di qualunque await: due chiamate quasi
     * simultanee (es. il timer di scheduleHomeGuestLoginPrompt e un tap
     * manuale con force:true, o due timer ravvicinati) superavano entrambe
     * il vecchio controllo (fatto dopo un paio di await) e aprivano due
     * istanze della stessa modale con lo stesso id. Avvolgiamo l'intero
     * corpo in un try/finally cosi' il flag resta true per tutta la durata
     * della chiamata, inclusi gli early return, e si azzera una sola volta
     * alla fine (anche dopo la chiusura della modale).
     */
    this.isPromptOpen = true;

    try {
      const user = await firstValueFrom(this.auth.user$);

      if (!this.auth.isBaseProfile(user)) return;

      const profile = user
        ? await firstValueFrom(this.userStatsService.getUserProfile(user.uid))
        : undefined;

      /*
       * isBaseProfile() da sola non distingue un vero collegamento Google dal
       * companion google.com automatico di Play Games (vedi AuthService). Se
       * l'utente ha gia' un collegamento reale (auth.loginRewardClaimed, mai
       * impostato dal solo auto-login Play Games), non riproponiamo l'invito.
       */
      if (!user?.isAnonymous && profile?.auth?.loginRewardClaimed) return;

      const isPlayGamesProfile = this.isStoredPlayGamesProfile(profile);

      /*
       * Il prompt automatico in home serve solo per l'ospite anonimo.
       * Play Games e gia un profilo automatico: gli proponiamo Google/Facebook
       * solo quando tocca navbar o settings, senza interrompere il rientro in home.
       */
      if (
        options.source === 'home' &&
        (!user?.isAnonymous || isPlayGamesProfile)
      ) {
        return;
      }

      if (!options.force && !this.canShowHomePrompt()) return;

      const modal = await this.modalCtrl.create({
        component: AnonymousModalComponent,
        id: ANONYMOUS_MODAL_ID,
        cssClass: 'anon-modal',
        backdropDismiss: false,
      });

      await modal.present();
      await modal.onDidDismiss();
      this.rememberDismissal();
    } finally {
      this.isPromptOpen = false;
    }
  }

  // Programma il prompt quando si entra in home, ma lo annulla se si cambia pagina.
  scheduleHomeGuestLoginPrompt(): void {
    setTimeout(() => {
      if (!this.router.url.startsWith('/home')) return;

      this.openGuestLoginPrompt({ source: 'home' }).catch((error) => {
        console.warn('Prompt login ospite non mostrato:', error);
      });
    }, AUTH_CONFIG.guestPrompt.homeOpenDelayMs);
  }

  // Evita di mostrare il prompt a ogni rientro in home: resta un invito, non un muro.
  private canShowHomePrompt(): boolean {
    const rawValue = localStorage.getItem(
      AUTH_CONFIG.guestPrompt.lastDismissedStorageKey,
    );

    if (!rawValue) return true;

    const lastDismissedAt = Number(rawValue);

    if (!Number.isFinite(lastDismissedAt)) return true;

    return (
      Date.now() - lastDismissedAt >= AUTH_CONFIG.guestPrompt.homeCooldownMs
    );
  }

  // Memorizza quando l'utente ha chiuso il prompt o scelto di restare ospite.
  private rememberDismissal(): void {
    localStorage.setItem(
      AUTH_CONFIG.guestPrompt.lastDismissedStorageKey,
      String(Date.now()),
    );
  }

  private isStoredPlayGamesProfile(profile?: AppUserProfile): boolean {
    return Boolean(
      profile?.auth?.providerIds?.includes(AUTH_CONFIG.providers.playGames) ||
        profile?.auth?.createdFromProviderId === AUTH_CONFIG.providers.playGames,
    );
  }
}
