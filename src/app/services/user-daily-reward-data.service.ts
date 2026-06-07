import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  UpdateData,
  DocumentData,
} from '@angular/fire/firestore';

import { UserAvatarData, UserStats } from 'src/app/models/user-stats.model';
import {
  DailyRewardClaimPayload,
  UserDailyRewardData,
} from 'src/app/models/daily-reward.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { getLevelFromXp } from 'src/app/utils/level-progress.util';

@Injectable({
  providedIn: 'root',
})
export class UserDailyRewardDataService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  readonly defaultStats: UserStats = {
    quizPlayed: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    bestScore: 0,
    streakDays: 0,
    xp: 0,
    level: USER_STATS_CONFIG.defaultLevel,
    levelRewardLastClaimedLevel: USER_STATS_CONFIG.defaultLevel,
    coins: USER_STATS_CONFIG.defaultCoins,
    lives: USER_STATS_CONFIG.defaultLives,
    lastQuizPlayedAt: null,
  };

  readonly defaultAvatar: UserAvatarData = {
    selectedAvatar: 'letter',
    unlockedAvatarIds: [],
  };

  readonly defaultDailyReward: UserDailyRewardData = {
    currentDay: 1,
    lastClaimDate: null,
    lastClaimedAt: null,
    claimedToday: false,
  };

  async getDailyRewardData(uid: string): Promise<UserDailyRewardData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await this.runFirestore(() => getDoc(userRef));

    if (!snapshot.exists()) {
      return this.defaultDailyReward;
    }

    const data = snapshot.data();
    const dailyReward = data['dailyReward'] as Partial<UserDailyRewardData>;

    if (!dailyReward) {
      await this.runFirestore(() =>
        updateDoc(userRef, {
          dailyReward: this.defaultDailyReward,
        }),
      );

      return this.defaultDailyReward;
    }

    return {
      ...this.defaultDailyReward,
      ...dailyReward,
    };
  }

  async updateDailyRewardData(
    uid: string,
    data: Partial<UserDailyRewardData>,
  ): Promise<void> {
    const updatePayload: UpdateData<DocumentData> = {};

    for (const [key, value] of Object.entries(data)) {
      updatePayload[`dailyReward.${key}`] = value;
    }

    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() => updateDoc(userRef, updatePayload));
  }

  async claimDailyReward(
    uid: string,
    todayKey: string,
    expectedRewardDay: number,
    maxRewardDay: number,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<UserDailyRewardData | null> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return null;

        const data = snapshot.data();
        const dailyReward = {
          ...this.defaultDailyReward,
          ...(data['dailyReward'] as Partial<UserDailyRewardData> | undefined),
        };

        if (dailyReward.lastClaimDate === todayKey) {
          return null;
        }

        const currentDay = Math.min(
          Math.max(dailyReward.currentDay ?? 1, 1),
          maxRewardDay,
        );

        if (
          currentDay !== expectedRewardDay ||
          rewardPayload.rewardDay !== expectedRewardDay
        ) {
          return null;
        }

        const nextDay = currentDay >= maxRewardDay ? 1 : currentDay + 1;

        const updatedDailyReward: UserDailyRewardData = {
          currentDay: nextDay,
          lastClaimDate: todayKey,
          lastClaimedAt: new Date(),
          claimedToday: true,
        };

        const updates: UpdateData<DocumentData> = {
          'dailyReward.currentDay': updatedDailyReward.currentDay,
          'dailyReward.lastClaimDate': updatedDailyReward.lastClaimDate,
          'dailyReward.lastClaimedAt': serverTimestamp(),
          'dailyReward.claimedToday': updatedDailyReward.claimedToday,
        };

        if (rewardPayload.coins && rewardPayload.coins > 0) {
          const currentCoins =
            typeof data['stats']?.coins === 'number'
              ? data['stats'].coins
              : this.defaultStats.coins;

          updates['stats.coins'] = currentCoins + rewardPayload.coins;
        }

        if (rewardPayload.xp && rewardPayload.xp > 0) {
          const currentXp =
            typeof data['stats']?.xp === 'number'
              ? data['stats'].xp
              : this.defaultStats.xp;

          const updatedXp = currentXp + rewardPayload.xp;
          const updatedLevel = getLevelFromXp(updatedXp);

          updates['stats.xp'] = updatedXp;
          updates['stats.level'] = updatedLevel;
        }

        if (rewardPayload.avatarId) {
          const avatar = data['avatar'] as Partial<UserAvatarData> | undefined;
          const unlockedAvatarIds = Array.isArray(avatar?.unlockedAvatarIds)
            ? avatar.unlockedAvatarIds
            : [];

          updates['avatar.unlockedAvatarIds'] = unlockedAvatarIds.includes(
            rewardPayload.avatarId,
          )
            ? unlockedAvatarIds
            : [...unlockedAvatarIds, rewardPayload.avatarId];

          if (!avatar?.selectedAvatar) {
            updates['avatar.selectedAvatar'] =
              this.defaultAvatar.selectedAvatar;
          }
        }

        transaction.update(userRef, updates);

        return updatedDailyReward;
      }),
    );
  }

  async applyDailyRewardBonus(
    uid: string,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<boolean> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return false;

        const data = snapshot.data();
        const updates: UpdateData<DocumentData> = {};
        const stats = data['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.defaultStats.coins;
        const currentXp =
          typeof stats?.xp === 'number' ? stats.xp : this.defaultStats.xp;

        if (rewardPayload.coins && rewardPayload.coins > 0) {
          updates['stats.coins'] = currentCoins + rewardPayload.coins;
        }

        if (rewardPayload.xp && rewardPayload.xp > 0) {
          const updatedXp = currentXp + rewardPayload.xp;
          const updatedLevel = getLevelFromXp(updatedXp);

          updates['stats.xp'] = updatedXp;
          updates['stats.level'] = updatedLevel;
        }

        if (Object.keys(updates).length === 0) return false;

        transaction.update(userRef, updates);

        return true;
      }),
    );
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
