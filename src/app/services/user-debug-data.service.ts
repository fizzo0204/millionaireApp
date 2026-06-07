import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  deleteField,
} from '@angular/fire/firestore';

import {
  UserArcadeData,
  UserAvatarData,
  UserOnboardingData,
  UserStats,
} from 'src/app/models/user-stats.model';
import { UserDailyRewardData } from 'src/app/models/daily-reward.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

@Injectable({
  providedIn: 'root',
})
export class UserDebugDataService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  readonly progressSubcollectionNames = [
    'completedLevels',
    'quizHistory',
    'progress',
  ] as const;

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

  readonly defaultOnboarding: UserOnboardingData = {
    tutorialCompleted: false,
    tutorialRewardClaimed: false,
    tutorialSkipped: false,
  };

  readonly defaultArcade: UserArcadeData = {
    currentLevel: 1,
    bestLevel: 1,
    totalLevelsCompleted: 0,
    lastPlayedAt: null,
    lastCompletedAt: null,
  };

  async deleteUserProfileData(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    for (const collectionName of this.progressSubcollectionNames) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );

      const snapshot = await this.runFirestore(() => getDocs(collectionRef));

      for (const document of snapshot.docs) {
        await this.runFirestore(() => deleteDoc(document.ref));
      }
    }

    await this.runFirestore(() => deleteDoc(userRef));
  }

  async resetUserDebugData(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    for (const collectionName of this.progressSubcollectionNames) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );

      const snapshot = await this.runFirestore(() => getDocs(collectionRef));

      for (const document of snapshot.docs) {
        await this.runFirestore(() => deleteDoc(document.ref));
      }
    }

    await this.runFirestore(() =>
      updateDoc(userRef, {
        stats: {
          ...this.defaultStats,
          lastLifeUpdate: null,
        },
        dailyReward: this.defaultDailyReward,
        avatar: this.defaultAvatar,
        onboarding: this.defaultOnboarding,
        arcade: this.defaultArcade,
        dailyEvents: deleteField(),
        nickname: deleteField(),
      }),
    );
  }

  async resetArcadeDebugData(uid: string): Promise<void> {
    /*
     * Reset mirato della Scalata per i test: non tocca XP, TurtleCoins,
     * vite, tutorial, reward o progressi delle categorie.
     */
    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      updateDoc(userRef, {
        arcade: this.defaultArcade,
      }),
    );
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
