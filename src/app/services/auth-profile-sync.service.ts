import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { User, updateProfile } from 'firebase/auth';
import { firebaseAuth } from 'src/app/config/firebase.config';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import {
  AppAuthProviderId,
  ProviderProfileMetadata,
} from 'src/app/models/auth.model';
import { UserStatsService } from './user-stats.service';
import { PlayGamesAuthService } from './play-games-auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthProfileSyncService {
  constructor(
    private userStatsService: UserStatsService,
    private playGamesAuthService: PlayGamesAuthService,
  ) {}

  // Allinea il documento Firestore al provider reale dopo un login diretto.
  async syncSignedInProviderProfile(
    user: User,
    providerId: AppAuthProviderId,
    providerProfile?: ProviderProfileMetadata,
  ): Promise<User> {
    await this.userStatsService.ensureUserProfile(user);

    if (providerId === AUTH_CONFIG.providers.playGames) {
      await this.applyProviderProfileMetadata(user, providerProfile);
      await this.userStatsService.markPlayGamesProfile(
        user.uid,
        providerProfile,
      );
    }

    try {
      await user.reload();
    } catch {
      // Non blocchiamo il flusso: Firestore contiene gia il provider corretto.
    }

    return firebaseAuth.currentUser ?? user;
  }

  // Applica displayName e photoURL del provider al profilo Firebase corrente.
  async applyProviderProfileMetadata(
    user: User,
    providerProfile?: ProviderProfileMetadata,
  ): Promise<void> {
    if (!providerProfile?.displayName && !providerProfile?.photoURL) return;

    try {
      await updateProfile(user, {
        displayName: providerProfile.displayName ?? user.displayName,
        photoURL: providerProfile.photoURL ?? user.photoURL,
      });
    } catch (error) {
      console.warn('Profilo Firebase non aggiornato con dati provider:', error);
    }
  }

  // Recupera nickname/foto Play Games salvati quando Firebase non li ha ancora disponibili.
  async hydrateStoredPlayGamesProfile(user: User): Promise<User | null> {
    if (!this.playGamesAuthService.canUsePlayGames) return null;

    const profile = await firstValueFrom(
      this.userStatsService.getUserProfile(user.uid),
    );
    const providerIds = profile?.auth?.providerIds ?? [];
    const isPurePlayGames =
      providerIds.includes(AUTH_CONFIG.providers.playGames) &&
      !providerIds.includes(AUTH_CONFIG.providers.google) &&
      !providerIds.includes(AUTH_CONFIG.providers.facebook);

    if (!isPurePlayGames || profile?.displayName) return null;

    try {
      const providerProfile =
        await this.playGamesAuthService.getNativePlayGamesProfile();

      if (!providerProfile?.displayName && !providerProfile?.photoURL) {
        return null;
      }

      await this.applyProviderProfileMetadata(user, providerProfile);
      await this.userStatsService.markPlayGamesProfile(
        user.uid,
        providerProfile,
      );

      return firebaseAuth.currentUser ?? user;
    } catch (error) {
      console.warn('Nickname Play Games non recuperato:', error);
      return null;
    }
  }
}
