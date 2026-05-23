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
import { GameLoaderComponent } from 'src/app/components/game-loader/game-loader.component';

type LoginProviderAction = 'google' | 'facebook' | 'playGames';

@Component({
  selector: 'app-anonymous-modal',
  standalone: true,
  imports: [IonicModule, CommonModule, GameLoaderComponent],
  templateUrl: './anonymous-modal.component.html',
  styleUrls: ['./anonymous-modal.component.scss'],
})
export class AnonymousModalComponent {
  activeLoginProvider: LoginProviderAction | null = null;
  private readonly minLoaderMs = 700;

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

  get isLoading(): boolean {
    return this.activeLoginProvider !== null;
  }

  isProviderLoading(provider: LoginProviderAction): boolean {
    return this.activeLoginProvider === provider;
  }

  get loaderTitle(): string {
    if (this.activeLoginProvider === 'google') return 'Accesso Google...';
    if (this.activeLoginProvider === 'facebook') return 'Accesso Facebook...';
    if (this.activeLoginProvider === 'playGames') return 'Accesso Play Games...';

    return 'Accesso in corso...';
  }

  get loaderSubtitle(): string {
    if (this.activeLoginProvider === 'google') {
      return 'Colleghiamo il tuo profilo Google ai progressi';
    }

    if (this.activeLoginProvider === 'facebook') {
      return 'Colleghiamo il tuo profilo Facebook ai progressi';
    }

    if (this.activeLoginProvider === 'playGames') {
      return 'Recuperiamo il tuo profilo Play Games';
    }

    return 'Stiamo proteggendo i tuoi progressi';
  }

  // Collega il profilo ospite a Google; se riesce, la modale si chiude.
  async googleLogin() {
    await this.runLoginAction(
      'google',
      () => this.auth.googleSignIn(),
      'Login non completato o annullato.',
    );
  }

  // Collega il profilo ospite a Facebook; se riesce, la modale si chiude.
  async facebookLogin() {
    await this.runLoginAction(
      'facebook',
      () => this.auth.facebookSignIn(),
      'Login Facebook non completato o annullato.',
    );
  }

  // Collega l'ospite a Play Games su Android mantenendo i progressi attuali.
  async playGamesLogin() {
    await this.runLoginAction(
      'playGames',
      () => this.auth.playGamesSignIn(),
      'Accesso Play Games non completato o annullato.',
    );
  }

  // Non cambia account: l'utente resta ospite e continua a giocare.
  async continueAsGuest() {
    if (this.isLoading) return;

    this.auth.rememberGuestChoice();
    await this.close();
  }

  private async runLoginAction(
    provider: LoginProviderAction,
    action: () => Promise<boolean>,
    errorMessage: string,
  ): Promise<void> {
    if (this.isLoading) return;

    this.activeLoginProvider = provider;
    const startedAt = Date.now();

    try {
      const success = await action();

      await this.waitRemainingLoaderTime(startedAt);

      if (success) {
        await this.close();
      }
    } catch {
      await this.waitRemainingLoaderTime(startedAt);
      alert(errorMessage);
    } finally {
      this.activeLoginProvider = null;
    }
  }

  private async waitRemainingLoaderTime(startedAt: number): Promise<void> {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, this.minLoaderMs - elapsedMs);

    if (remainingMs <= 0) return;

    await new Promise((resolve) => setTimeout(resolve, remainingMs));
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
