import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import { AnonymousModalComponent } from 'src/app/components/anonymous-modal/anonymous-modal.component';
import { AuthService } from './auth.service';

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
  ) {}

  // Apre la modale login solo se l'utente corrente e un ospite anonimo.
  async openGuestLoginPrompt(options: LoginPromptOptions = {}): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user?.isAnonymous || this.isPromptOpen) return;

    if (!options.force && !this.canShowHomePrompt()) return;

    this.isPromptOpen = true;

    try {
      const modal = await this.modalCtrl.create({
        component: AnonymousModalComponent,
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
}
