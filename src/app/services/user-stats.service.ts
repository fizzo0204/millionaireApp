import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  runTransaction,
  docData,
  collection,
  addDoc,
  collectionData,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  UpdateData,
  DocumentData,
} from '@angular/fire/firestore';
import {
  UserStats,
  AppUserProfile,
  QuizHistoryItem,
  UserAvatarData,
} from 'src/app/models/user-stats.model';
import { User } from 'firebase/auth';
import { Observable } from 'rxjs';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { DifficultyId } from '../models/difficulty.model';
import {
  DailyRewardClaimPayload,
  UserDailyRewardData,
} from 'src/app/models/daily-reward.model';

@Injectable({
  providedIn: 'root',
})
export class UserStatsService {
  private firestore = inject(Firestore);

  readonly defaultStats: UserStats = {
    quizPlayed: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    bestScore: 0,
    streakDays: 0,
    xp: 0,
    level: USER_STATS_CONFIG.defaultLevel,
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
    claimedToday: false,
  };

  async ensureUserProfile(user: User): Promise<void> {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        stats: this.defaultStats,
        dailyReward: this.defaultDailyReward,
        avatar: this.defaultAvatar,
      });

      return;
    }

    const data = snapshot.data();

    const updates: UpdateData<DocumentData> = {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      lastLoginAt: serverTimestamp(),
    };

    if (!data['dailyReward']) {
      updates['dailyReward'] = this.defaultDailyReward;
    }

    if (!data['avatar']) {
      updates['avatar'] = {
        selectedAvatar:
          data['selectedAvatar'] ??
          data['dailyReward']?.selectedAvatar ??
          'letter',
        unlockedAvatarIds:
          data['unlockedAvatarIds'] ??
          data['dailyReward']?.unlockedAvatarIds ??
          [],
      };
    }

    await updateDoc(userRef, updates);
  }

  getUserProfile(uid: string): Observable<AppUserProfile | undefined> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return docData(userRef) as Observable<AppUserProfile | undefined>;
  }

  async getDailyRewardData(uid: string): Promise<UserDailyRewardData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      return this.defaultDailyReward;
    }

    const data = snapshot.data();
    const dailyReward = data['dailyReward'] as Partial<UserDailyRewardData>;

    if (!dailyReward) {
      await updateDoc(userRef, {
        dailyReward: this.defaultDailyReward,
      });

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

    await updateDoc(userRef, updatePayload);
  }

  async claimDailyReward(
    uid: string,
    todayKey: string,
    expectedRewardDay: number,
    maxRewardDay: number,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<UserDailyRewardData | null> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return null;

      const data = snapshot.data();
      const dailyReward = {
        ...this.defaultDailyReward,
        ...(data['dailyReward'] as Partial<UserDailyRewardData> | undefined),
      };

      if (dailyReward.lastClaimDate === todayKey) return null;

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
        claimedToday: true,
      };

      const updates: UpdateData<DocumentData> = {
        'dailyReward.currentDay': updatedDailyReward.currentDay,
        'dailyReward.lastClaimDate': updatedDailyReward.lastClaimDate,
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
        const updatedLevel = Math.max(
          1,
          Math.floor(updatedXp / USER_STATS_CONFIG.xpPerLevel) +
            USER_STATS_CONFIG.defaultLevel,
        );

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
          updates['avatar.selectedAvatar'] = this.defaultAvatar.selectedAvatar;
        }
      }

      transaction.update(userRef, updates);

      return updatedDailyReward;
    });
  }

  async applyDailyRewardBonus(
    uid: string,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<boolean> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return false;

      const data = snapshot.data();
      const updates: UpdateData<DocumentData> = {};

      if (rewardPayload.coins && rewardPayload.coins > 0) {
        updates['stats.coins'] = increment(rewardPayload.coins);
      }

      if (rewardPayload.xp && rewardPayload.xp > 0) {
        const currentXp =
          typeof data['stats']?.xp === 'number'
            ? data['stats'].xp
            : this.defaultStats.xp;

        const updatedXp = currentXp + rewardPayload.xp;
        const updatedLevel = Math.max(
          1,
          Math.floor(updatedXp / USER_STATS_CONFIG.xpPerLevel) +
            USER_STATS_CONFIG.defaultLevel,
        );

        updates['stats.xp'] = increment(rewardPayload.xp);
        updates['stats.level'] = updatedLevel;
      }

      if (Object.keys(updates).length === 0) return false;

      transaction.update(userRef, updates);

      return true;
    });
  }

  async getAvatarData(uid: string): Promise<UserAvatarData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      return this.defaultAvatar;
    }

    const data = snapshot.data();

    const avatar: UserAvatarData = {
      selectedAvatar:
        data['avatar']?.selectedAvatar ??
        data['selectedAvatar'] ??
        data['dailyReward']?.selectedAvatar ??
        'letter',
      unlockedAvatarIds:
        data['avatar']?.unlockedAvatarIds ??
        data['unlockedAvatarIds'] ??
        data['dailyReward']?.unlockedAvatarIds ??
        [],
    };

    if (!data['avatar']) {
      await updateDoc(userRef, {
        avatar,
      });
    }

    return avatar;
  }

  async unlockDailyAvatar(uid: string, avatarId: string): Promise<void> {
    const avatar = await this.getAvatarData(uid);

    if (avatar.unlockedAvatarIds.includes(avatarId)) {
      return;
    }

    await this.updateAvatarData(uid, {
      unlockedAvatarIds: [...avatar.unlockedAvatarIds, avatarId],
    });
  }

  async saveSelectedAvatar(uid: string, avatarId: string): Promise<void> {
    await this.updateAvatarData(uid, {
      selectedAvatar: avatarId,
    });
  }

  async updateAvatarData(
    uid: string,
    data: Partial<UserAvatarData>,
  ): Promise<void> {
    const updatePayload: UpdateData<DocumentData> = {};

    for (const [key, value] of Object.entries(data)) {
      updatePayload[`avatar.${key}`] = value;
    }

    const userRef = doc(this.firestore, `users/${uid}`);

    await updateDoc(userRef, updatePayload);
  }

  private getStartOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private getStartOfYesterday(): Date {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  }

  async recordQuizResult(
    uid: string,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();
      const stats = data['stats'];

      const currentBestScore = stats?.bestScore ?? 0;
      const currentXp = stats?.xp ?? 0;
      const currentStreakDays = stats?.streakDays ?? 0;
      const lastQuizPlayedAt = stats?.lastQuizPlayedAt;
      const todayStart = this.getStartOfToday();
      const yesterdayStart = this.getStartOfYesterday();

      let updatedStreakDays = currentStreakDays;

      if (!lastQuizPlayedAt?.toDate) {
        updatedStreakDays = 1;
      } else {
        const lastPlayedDate = lastQuizPlayedAt.toDate();
        lastPlayedDate.setHours(0, 0, 0, 0);

        if (lastPlayedDate.getTime() === todayStart.getTime()) {
          updatedStreakDays = currentStreakDays;
        } else if (lastPlayedDate.getTime() === yesterdayStart.getTime()) {
          updatedStreakDays = currentStreakDays + 1;
        } else {
          updatedStreakDays = 1;
        }
      }

      const xpEarned = correctAnswers * USER_STATS_CONFIG.xpPerCorrectAnswer;
      const updatedXp = currentXp + xpEarned;

      const updatedLevel = Math.max(
        1,
        Math.floor(updatedXp / USER_STATS_CONFIG.xpPerLevel) +
          USER_STATS_CONFIG.defaultLevel,
      );

      transaction.update(userRef, {
        'stats.quizPlayed': increment(1),
        'stats.correctAnswers': increment(correctAnswers),
        'stats.wrongAnswers': increment(totalQuestions - correctAnswers),
        'stats.xp': increment(xpEarned),
        'stats.level': updatedLevel,
        'stats.bestScore': Math.max(currentBestScore, correctAnswers),
        'stats.streakDays': updatedStreakDays,
        'stats.lastQuizPlayedAt': serverTimestamp(),
      });
    });
  }

  async recordQuizHistory(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    await addDoc(historyRef, {
      categoryId,
      difficultyId,
      correctAnswers,
      totalQuestions,
      playedAt: serverTimestamp(),
    });
  }

  getRecentQuizHistory(
    uid: string,
    maxResults: number = 5,
  ): Observable<QuizHistoryItem[]> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    const historyQuery = query(
      historyRef,
      orderBy('playedAt', 'desc'),
      limit(maxResults),
    );

    return collectionData(historyQuery, {
      idField: 'id',
    }) as Observable<QuizHistoryItem[]>;
  }

  async addXp(uid: string, amount: number): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) return;

    const data = snapshot.data();
    const currentXp = data['stats']?.xp ?? 0;

    const updatedXp = currentXp + amount;
    const updatedLevel = Math.max(
      1,
      Math.floor(updatedXp / USER_STATS_CONFIG.xpPerLevel) +
        USER_STATS_CONFIG.defaultLevel,
    );

    await updateDoc(userRef, {
      'stats.xp': increment(amount),
      'stats.level': updatedLevel,
    });
  }

  async resetUserDebugData(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    const collectionsToClear = ['completedLevels', 'quizHistory', 'progress'];

    for (const collectionName of collectionsToClear) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );

      const snapshot = await getDocs(collectionRef);

      for (const document of snapshot.docs) {
        await deleteDoc(document.ref);
      }
    }

    await updateDoc(userRef, {
      stats: {
        ...this.defaultStats,
        lastLifeUpdate: null,
      },
      dailyReward: this.defaultDailyReward,
      avatar: this.defaultAvatar,
    });
  }
}
