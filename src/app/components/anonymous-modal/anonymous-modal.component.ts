import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { User } from 'firebase/auth';
import { combineLatest, map, of, shareReplay, switchMap } from 'rxjs';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import { AppUserProfile } from 'src/app/models/user-stats.model';
import { AuthService } from 'src/app/services/auth.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

@Component({
  selector: 'app-anonymous-modal',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './anonymous-modal.component.html',
  styleUrls: ['./anonymous-modal.component.scss'],
})
export class AnonymousModalComponent {
  loading = false;

  profile$ = this.auth.user$.pipe(
    switchMap((user) => {
      if (!user) return of(undefined);

      return this.userStatsService.getUserProfile(user.uid);
    }),
    shareReplay(1),
  );

  continueLabel$ = combineLatest([this.auth.user$, this.profile$]).pipe(
    map(([user, profile]) =>
      this.isPlayGamesProfile(user, profile)
        ? 'Continua con Play Games'
        : 'Continua come ospite',
    ),
  );

  showPlayGamesButton$ = combineLatest([this.auth.user$, this.profile$]).pipe(
    map(
      ([user, profile]) =>
        this.auth.canConnectPlayGames(user) &&
        !this.isPlayGamesProfile(user, profile),
    ),
  );

  constructor(
    private auth: AuthService,
    private modalCtrl: ModalController,
    private userStatsService: UserStatsService,
  ) {}

  // Collega il profilo ospite a Google; se riesce, la modale si chiude.
  async googleLogin() {
    if (this.loading) return;

    this.loading = true;

    try {
      const success = await this.auth.googleSignIn();

      if (success) {
        await this.close();
      }
    } catch {
      alert('Login non completato o annullato.');
    } finally {
      this.loading = false;
    }
  }

  // Collega il profilo ospite a Facebook; se riesce, la modale si chiude.
  async facebookLogin() {
    if (this.loading) return;

    this.loading = true;
    try {
      const success = await this.auth.facebookSignIn();

      if (success) {
        await this.close();
      }
    } catch {
      alert('Login Facebook non completato o annullato.');
    } finally {
      this.loading = false;
    }
  }

  // Collega l'ospite a Play Games su Android mantenendo i progressi attuali.
  async playGamesLogin() {
    if (this.loading) return;

    this.loading = true;
    try {
      const success = await this.auth.playGamesSignIn();

      if (success) {
        await this.close();
      }
    } catch {
      alert('Accesso Play Games non completato o annullato.');
    } finally {
      this.loading = false;
    }
  }

  // Non cambia account: l'utente resta ospite e continua a giocare.
  async continueAsGuest() {
    if (this.loading) return;

    await this.close();
  }

  // Chiude la modale Ionic corrente.
  private async close() {
    await this.modalCtrl.dismiss();
  }

  private isPlayGamesProfile(
    user: User | null,
    profile?: AppUserProfile,
  ): boolean {
    /*
     * Se Firebase JS resta momentaneamente anonimo dopo il link, Firestore
     * resta comunque la fonte aggiornata per capire che il profilo e Play Games.
     */
    if (this.auth.isPlayGamesBaseProfile(user)) return true;

    return Boolean(
      profile?.auth?.providerIds?.includes(AUTH_CONFIG.providers.playGames) ||
        profile?.auth?.createdFromProviderId === AUTH_CONFIG.providers.playGames,
    );
  }
}
