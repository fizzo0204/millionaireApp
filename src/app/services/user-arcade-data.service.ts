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
} from '@angular/fire/firestore';

import { UserArcadeData, UserStats } from 'src/app/models/user-stats.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { ARCADE_CONFIG } from 'src/app/config/arcade.config';
import { getLevelFromXp } from 'src/app/utils/level-progress.util';

@Injectable({
  providedIn: 'root',
})
export class UserArcadeDataService {
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

  readonly defaultArcade: UserArcadeData = {
    currentLevel: 1,
    bestLevel: 1,
    totalLevelsCompleted: 0,
    lastPlayedAt: null,
    lastCompletedAt: null,
  };

  async getArcadeData(uid: string): Promise<UserArcadeData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await this.runFirestore(() => getDoc(userRef));

    if (!snapshot.exists()) {
      return this.defaultArcade;
    }

    const data = snapshot.data();
    const arcade = data['arcade'] as Partial<UserArcadeData> | undefined;

    if (!arcade) {
      await this.runFirestore(() =>
        updateDoc(userRef, {
          arcade: this.defaultArcade,
        }),
      );

      return this.defaultArcade;
    }

    return {
      ...this.defaultArcade,
      ...arcade,
    };
  }

  async recordArcadeLevelCompleted(
    uid: string,
    completedArcadeLevel: number,
    rewardCoins: number,
    rewardXp: number,
  ): Promise<UserArcadeData | null> {
    const userRef = doc(this.firestore, `users/${uid}`);

    const safeCompletedLevel = Math.max(
      1,
      Math.min(ARCADE_CONFIG.maxTrackedLevel, Math.floor(completedArcadeLevel)),
    );

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return null;

        const data = snapshot.data();

        const arcade = {
          ...this.defaultArcade,
          ...(data['arcade'] as Partial<UserArcadeData> | undefined),
        };

        if (arcade.currentLevel !== safeCompletedLevel) {
          return null;
        }

        const stats = data['stats'] ?? {};

        const nextLevel = Math.min(
          safeCompletedLevel + 1,
          ARCADE_CONFIG.maxTrackedLevel,
        );

        const currentXp =
          typeof stats?.xp === 'number' ? stats.xp : this.defaultStats.xp;

        const currentCorrectAnswers =
          typeof stats?.correctAnswers === 'number'
            ? stats.correctAnswers
            : this.defaultStats.correctAnswers;

        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.defaultStats.coins;

        const updatedXp = currentXp + rewardXp;
        const updatedLevel = getLevelFromXp(updatedXp);

        const updatedArcade: UserArcadeData = {
          currentLevel: nextLevel,
          bestLevel: Math.max(arcade.bestLevel ?? 1, nextLevel),
          totalLevelsCompleted: (arcade.totalLevelsCompleted ?? 0) + 1,
          lastPlayedAt: new Date(),
          lastCompletedAt: new Date(),
        };

        transaction.update(userRef, {
          'arcade.currentLevel': updatedArcade.currentLevel,
          'arcade.bestLevel': updatedArcade.bestLevel,
          'arcade.totalLevelsCompleted': updatedArcade.totalLevelsCompleted,
          'arcade.lastPlayedAt': serverTimestamp(),
          'arcade.lastCompletedAt': serverTimestamp(),
          'stats.correctAnswers': currentCorrectAnswers + 1,
          'stats.coins': currentCoins + rewardCoins,
          'stats.xp': updatedXp,
          'stats.level': updatedLevel,
          'stats.lastQuizPlayedAt': serverTimestamp(),
        });

        return updatedArcade;
      }),
    );
  }

  async recordArcadeMistake(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const stats = data['stats'] ?? {};

        const currentWrongAnswers =
          typeof stats?.wrongAnswers === 'number'
            ? stats.wrongAnswers
            : this.defaultStats.wrongAnswers;

        transaction.update(userRef, {
          'stats.wrongAnswers': currentWrongAnswers + 1,
          'stats.lastQuizPlayedAt': serverTimestamp(),
          'arcade.lastPlayedAt': serverTimestamp(),
        });
      }),
    );
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
