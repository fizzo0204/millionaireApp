import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import {
  combineLatest,
  Observable,
  firstValueFrom,
  map,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';
import { User } from 'firebase/auth';
import { AuthService } from '../../services/auth.service';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AVATARS } from 'src/app/data/avatars.data';
import { AppUserProfile } from 'src/app/models/user-stats.model';
import { AuthPromptService } from 'src/app/services/auth-prompt.service';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import { AppAuthProviderId } from 'src/app/models/auth.model';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

@Component({
  selector: 'app-login-button',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './login-button.component.html',
  styleUrls: ['./login-button.component.scss'],
})
export class LoginButtonComponent {
  user$: Observable<User | null> = this.auth.user$;

  loading$ = this.auth.isLoading$;

  profile$: Observable<AppUserProfile | undefined> = this.user$.pipe(
    switchMap((user) => {
      if (!user) return of(undefined);

      return this.userStatsService.getUserProfile(user.uid);
    }),
    shareReplay(1),
  );

  level$: Observable<number> = this.profile$.pipe(
    map(
      (profile) =>
        profile?.stats?.level ?? this.userStatsService.defaultStats.level,
    ),
  );

  selectedAvatar$: Observable<string> = this.profile$.pipe(
    map((profile) => profile?.avatar?.selectedAvatar ?? 'letter'),
  );

  viewModel$ = combineLatest([
    this.user$,
    this.profile$,
    this.selectedAvatar$,
    this.level$,
    this.loading$,
  ]).pipe(
    map(([user, profile, selectedAvatar, level, loading]) => ({
      user,
      profile,
      selectedAvatar,
      level,
      loading,
    })),
  );

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
    private authPromptService: AuthPromptService,
    private navigation: NavigationTransitionService,
  ) {}

  getFirstName(user: User, profile?: AppUserProfile): string {
    if (profile?.nickname?.trim()) {
      return profile.nickname.trim();
    }

    if (this.isPlayGamesProfile(user, profile)) {
      const displayName = user.displayName || profile?.displayName;

      return displayName ? this.extractFirstName(displayName) : 'Play Games';
    }

    if (user.isAnonymous) return 'Ospite';

    return (
      this.extractFirstName(user.displayName || profile?.displayName) ||
      'Utente'
    );
  }

  getPlayerTag(user: User, profile?: AppUserProfile): string {
    if (user.isAnonymous) return 'GUEST';
    if (this.hasProvider(user, profile, AUTH_CONFIG.providers.google)) {
      return 'GOOGLE';
    }
    if (this.hasProvider(user, profile, AUTH_CONFIG.providers.facebook)) {
      return 'FACEBOOK';
    }
    if (this.isPlayGamesProfile(user, profile)) return 'PLAY GAMES';

    return 'PLAYER';
  }

  getAvatarLetter(user: User | null, profile?: AppUserProfile): string {
    if (!user) return 'U';

    return this.getFirstName(user, profile).charAt(0).toUpperCase();
  }

  getSelectedAvatarIcon(
    user: User | null,
    selectedAvatar?: string | null,
    profile?: AppUserProfile,
  ): string {
    const avatarId = selectedAvatar || 'letter';

    if (avatarId === 'letter') {
      return this.getAvatarLetter(user, profile);
    }

    const avatar = AVATARS.find((item) => item.id === avatarId);

    return avatar?.icon || this.getAvatarLetter(user, profile);
  }

  getSelectedAvatarImageSrc(selectedAvatar?: string | null): string | null {
    const avatar = AVATARS.find((item) => item.id === selectedAvatar);
    const icon = avatar?.icon ?? '';

    return icon.startsWith('assets/') ? icon : null;
  }

  async navigateToProfile() {
    const user = await firstValueFrom(this.user$);

    if (this.auth.isBaseProfile(user)) {
      // Da profilo base il bottone profilo diventa un invito gentile a collegare l'account.
      await this.authPromptService.openGuestLoginPrompt({
        force: true,
        source: 'navbar',
      });
      return;
    }

    await this.navigation.navigateByUrl('/profile');
  }

  private isPlayGamesProfile(
    user: User | null,
    profile?: AppUserProfile,
  ): boolean {
    /*
     * Play Games puo essere marcato in Firestore prima che Firebase JS aggiorni
     * providerData/isAnonymous. Per la navbar usiamo quindi anche il documento
     * profilo, cosi il bottone passa subito da Ospite a Play Games.
     */
    if (this.auth.isPlayGamesBaseProfile(user)) return true;

    return Boolean(
      profile?.auth?.providerIds?.includes(AUTH_CONFIG.providers.playGames) ||
      profile?.auth?.createdFromProviderId === AUTH_CONFIG.providers.playGames,
    );
  }

  private hasProvider(
    user: User | null,
    profile: AppUserProfile | undefined,
    providerId: AppAuthProviderId,
  ): boolean {
    /*
     * Per il tag della navbar diamo priorita al provider "forte" collegato
     * adesso. Un profilo puo nascere Play Games ma poi essere collegato a
     * Google/Facebook, quindi controlliamo sia Firebase sia Firestore.
     */
    return Boolean(
      user?.providerData?.some(
        (provider) => provider.providerId === providerId,
      ) || profile?.auth?.providerIds?.includes(providerId),
    );
  }

  private extractFirstName(displayName?: string | null): string {
    /*
     * Nel bottone profilo mostriamo solo il nome breve.
     */
    return displayName?.trim().split(/\s+/)[0] ?? '';
  }
}
