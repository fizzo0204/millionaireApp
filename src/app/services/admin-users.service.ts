import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { User } from 'firebase/auth';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
} from '@angular/fire/firestore';

import { AppUserProfile } from 'src/app/models/user-stats.model';
import { AppAuthProviderId } from 'src/app/models/auth.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { ADMIN_EMAIL } from 'src/app/config/admin.config';
import { UserStatsService } from 'src/app/services/user-stats.service';

export interface AdminUserRow {
  uid: string;
  email: string | null;
  nickname: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  providerIds: AppAuthProviderId[];
  level: number;
  xp: number;
  coins: number;
  lives: number;
  unlockedAvatarIds: string[];
  createdAt: unknown;
  lastLoginAt: unknown;
}

const MAX_LISTED_USERS = 300;

@Injectable({
  providedIn: 'root',
})
export class AdminUsersService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private userStatsService = inject(UserStatsService);

  isAdminUser(user: User | null | undefined): boolean {
    return (
      !!user &&
      !!user.email &&
      user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
      user.emailVerified
    );
  }

  async listUsers(): Promise<AdminUserRow[]> {
    const usersQuery = query(
      collection(this.firestore, 'users'),
      orderBy('lastLoginAt', 'desc'),
      limit(MAX_LISTED_USERS),
    );

    const snapshot = await this.runFirestore(() => getDocs(usersQuery));

    return snapshot.docs.map((docSnapshot) =>
      this.toAdminUserRow(docSnapshot.id, docSnapshot.data() as Partial<AppUserProfile>),
    );
  }

  // Aggiunge monete a un utente arbitrario (uso admin, non l'utente loggato).
  async addCoins(uid: string, amount: number): Promise<number> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return 0;

        const stats = snapshot.data()['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : USER_STATS_CONFIG.defaultCoins;
        const nextCoins = currentCoins + amount;

        transaction.update(userRef, {
          'stats.coins': nextCoins,
        });

        return nextCoins;
      }),
    );
  }

  // Sblocca un avatar per un utente arbitrario.
  async unlockAvatar(uid: string, avatarId: string): Promise<void> {
    return this.userStatsService.unlockAvatar(uid, avatarId);
  }

  // Reset completo: progressi, XP, livelli, monete, vite, cronologia.
  async resetUser(uid: string): Promise<void> {
    return this.userStatsService.resetUserDebugData(uid);
  }

  // Elimina definitivamente il documento profilo e le sottocollezioni.
  async deleteUser(uid: string): Promise<void> {
    return this.userStatsService.deleteUserProfileData(uid);
  }

  private toAdminUserRow(
    uid: string,
    data: Partial<AppUserProfile>,
  ): AdminUserRow {
    return {
      uid,
      email: data.email ?? null,
      nickname: data.nickname ?? null,
      displayName: data.displayName ?? null,
      isAnonymous: this.isAnonymousProfile(data.auth?.providerIds),
      providerIds: data.auth?.providerIds ?? [],
      level: data.stats?.level ?? USER_STATS_CONFIG.defaultLevel,
      xp: data.stats?.xp ?? 0,
      coins: data.stats?.coins ?? USER_STATS_CONFIG.defaultCoins,
      lives: data.stats?.lives ?? USER_STATS_CONFIG.defaultLives,
      unlockedAvatarIds: data.avatar?.unlockedAvatarIds ?? [],
      createdAt: data.createdAt ?? null,
      lastLoginAt: data.lastLoginAt ?? null,
    };
  }

  // Un profilo e considerato ospite se non ha altro provider oltre "anonymous".
  private isAnonymousProfile(providerIds?: AppAuthProviderId[]): boolean {
    if (!providerIds || providerIds.length === 0) return true;

    return providerIds.every((id) => id === 'anonymous');
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
