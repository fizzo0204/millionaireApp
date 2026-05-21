import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import {
  Observable,
  firstValueFrom,
  map,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';
import { User } from 'firebase/auth';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AVATARS } from 'src/app/data/avatars.data';
import { AppUserProfile } from 'src/app/models/user-stats.model';
import { AuthPromptService } from 'src/app/services/auth-prompt.service';

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

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
    private authPromptService: AuthPromptService,
    private router: Router,
  ) {}

  getFirstName(user: User): string {
    if (user.isAnonymous) return 'Ospite';

    return (user.displayName || 'Utente').split(' ')[0];
  }

  getPlayerTag(user: User): string {
    return user.isAnonymous ? 'OSPITE' : 'PLAYER';
  }

  getAvatarLetter(user: User | null): string {
    if (!user) return 'U';

    return this.getFirstName(user).charAt(0).toUpperCase();
  }

  getSelectedAvatarIcon(
    user: User | null,
    selectedAvatar?: string | null,
  ): string {
    const avatarId = selectedAvatar || 'letter';

    if (avatarId === 'letter') {
      return this.getAvatarLetter(user);
    }

    const avatar = AVATARS.find((item) => item.id === avatarId);

    return avatar?.icon || this.getAvatarLetter(user);
  }

  async navigateToProfile() {
    const user = await firstValueFrom(this.user$);

    if (user?.isAnonymous) {
      // Da ospite il bottone profilo diventa un invito gentile a collegare l'account.
      await this.authPromptService.openGuestLoginPrompt({
        force: true,
        source: 'navbar',
      });
      return;
    }

    await this.router.navigateByUrl('/profile');
  }
}
