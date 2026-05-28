import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  DocumentData,
  UpdateData,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import {
  DAILY_EVENTS_CONFIG,
  DAILY_MISSION_PLANS,
  DAILY_WHEEL_REWARDS,
} from 'src/app/config/daily-events.config';
import { STORAGE_KEYS } from 'src/app/config/storage-keys.config';
import { AVATARS } from 'src/app/data/avatars.data';
import {
  DailyEventsData,
  DailyMissionConfig,
  DailyMissionMetric,
  DailyMissionView,
  DailyWheelRewardConfig,
  DailyWheelRewardResult,
} from 'src/app/models/daily-events.model';
import { getLevelFromXp } from 'src/app/utils/level-progress.util';
import { AdsService } from './ads.service';
import { AuthService } from './auth.service';
import { UserStatsService } from './user-stats.service';

@Injectable({
  providedIn: 'root',
})
export class DailyEventsService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private ads = inject(AdsService);
  private userStatsService = inject(UserStatsService);

  readonly wheelRewards = DAILY_WHEEL_REWARDS;
  readonly dailyChallengeQuestionCount =
    DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount;
  readonly dailyChallengeCoinsReward =
    DAILY_EVENTS_CONFIG.dailyChallengeCoinsReward;

  constructor() {
    /*
     * Ogni rewarded video completato conta per la missione fissa giornaliera.
     * Cosi vale sia se il video parte da Eventi, sia se parte da quiz/shop/home.
     */
    this.ads.rewardedAdCompleted$.subscribe(() => {
      void this.trackMissionProgress('adsWatched');
    });
  }

  getTodayPlan(): DailyMissionConfig[] {
    return DAILY_MISSION_PLANS[this.getPlanIndex()] ?? DAILY_MISSION_PLANS[0];
  }

  async getTodayMissions(): Promise<DailyMissionView[]> {
    const user = await firstValueFrom(this.auth.user$);
    const data = user
      ? await this.getTodayData(user.uid)
      : this.getDefaultDailyEventsData();

    return this.getTodayPlan().map((mission) => {
      const progress = data.metrics[mission.metric] ?? 0;

      return {
        ...mission,
        progress,
        claimed: data.missionClaims[mission.id] === true,
        completed: progress >= mission.target,
      };
    });
  }

  async getTodayDataForCurrentUser(): Promise<DailyEventsData> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return this.getDefaultDailyEventsData();

    return this.getTodayData(user.uid);
  }

  getDebugWeekday(): number | null {
    const savedValue = localStorage.getItem(STORAGE_KEYS.dailyEventsDebugWeekday);

    if (savedValue === null) return null;

    const weekday = Number(savedValue);

    return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? weekday
      : null;
  }

  async setDebugWeekday(weekday: number | null): Promise<void> {
    if (weekday === null) {
      localStorage.removeItem(STORAGE_KEYS.dailyEventsDebugWeekday);
      await this.resetDailyEventsDebug();
      return;
    }

    const safeWeekday = Math.min(Math.max(Math.floor(weekday), 0), 6);

    localStorage.setItem(
      STORAGE_KEYS.dailyEventsDebugWeekday,
      String(safeWeekday),
    );

    await this.resetDailyEventsDebug();
  }

  async resetDailyEventsDebug(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await setDoc(
      userRef,
      {
        dailyEvents: this.getDefaultDailyEventsData(),
      },
      { merge: true },
    );
  }

  async trackDailyRewardCheck(): Promise<void> {
    await this.trackMissionProgress('dailyRewardChecks');
  }

  async trackDailyChallengeStarted(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeStarted', 1, 'max');
  }

  async trackDailyChallengeQuestion(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeQuestions');
  }

  async trackDailyChallengeCorrect(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeCorrect');
  }

  async trackDailyChallengeHelp(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeHelps');
  }

  async trackMissionProgress(
    metric: DailyMissionMetric,
    amount = 1,
    mode: 'increment' | 'max' = 'increment',
  ): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const data = snapshot.exists() ? snapshot.data() : {};
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const currentValue = dailyEvents.metrics[metric] ?? 0;

      dailyEvents.metrics[metric] =
        mode === 'max'
          ? Math.max(currentValue, amount)
          : currentValue + amount;

      transaction.set(
        userRef,
        {
          dailyEvents,
        },
        { merge: true },
      );
    });
  }

  async claimMissionReward(missionId: string): Promise<number> {
    const user = await firstValueFrom(this.auth.user$);
    const mission = this.getTodayPlan().find((item) => item.id === missionId);

    if (!user || !mission) return 0;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return 0;

      const data = snapshot.data();
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const progress = dailyEvents.metrics[mission.metric] ?? 0;

      if (dailyEvents.missionClaims[mission.id] || progress < mission.target) {
        return 0;
      }

      dailyEvents.missionClaims[mission.id] = true;

      transaction.update(userRef, {
        dailyEvents,
        'stats.coins': increment(mission.rewardCoins),
      });

      return mission.rewardCoins;
    });
  }

  async spinWheel(useAdSpin: boolean): Promise<DailyWheelRewardResult | null> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return null;

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let selectedReward = this.getWeightedWheelReward();
    let result: DailyWheelRewardResult | null = null;

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const freeSpinAvailable = dailyEvents.wheel.freeSpinDate !== this.todayKey;

      if (!useAdSpin && !freeSpinAvailable) return;

      const avatar = data['avatar'] as
        | { unlockedAvatarIds?: string[]; selectedAvatar?: string }
        | undefined;
      const unlockedAvatarIds = Array.isArray(avatar?.unlockedAvatarIds)
        ? avatar.unlockedAvatarIds
        : [];

      let avatarId: string | undefined;
      let amount = selectedReward.amount;

      if (selectedReward.type === 'baseAvatar') {
        const lockedBaseAvatar = this.getRandomLockedBaseAvatar(
          unlockedAvatarIds,
        );

        if (lockedBaseAvatar) {
          avatarId = lockedBaseAvatar.id;
          result = {
            reward: selectedReward,
            label: lockedBaseAvatar.label,
            doubled: false,
            avatarId,
          };
        } else {
          selectedReward =
            DAILY_WHEEL_REWARDS.find((reward) => reward.id === 'coins_5') ??
            selectedReward;
          amount = selectedReward.amount ?? 5;
        }
      }

      dailyEvents.wheel.freeSpinDate = freeSpinAvailable
        ? this.todayKey
        : dailyEvents.wheel.freeSpinDate;
      dailyEvents.wheel.spinsToday += 1;
      dailyEvents.metrics.wheelSpins =
        (dailyEvents.metrics.wheelSpins ?? 0) + 1;

      const updates: UpdateData<DocumentData> = {
        dailyEvents,
      };

      if (selectedReward.type === 'coins' && amount) {
        updates['stats.coins'] = increment(amount);
      }

      if (selectedReward.type === 'xp' && amount) {
        const currentXp =
          typeof data['stats']?.xp === 'number'
            ? data['stats'].xp
            : this.userStatsService.defaultStats.xp;
        const updatedXp = currentXp + amount;

        updates['stats.xp'] = increment(amount);
        updates['stats.level'] = getLevelFromXp(updatedXp);
      }

      if (selectedReward.type === 'baseAvatar' && avatarId) {
        updates['avatar.unlockedAvatarIds'] = unlockedAvatarIds.includes(
          avatarId,
        )
          ? unlockedAvatarIds
          : [...unlockedAvatarIds, avatarId];
      }

      transaction.update(userRef, updates);

      if (!result) {
        result = {
          reward: selectedReward,
          label: selectedReward.label,
          doubled: false,
          amount,
        };
      }
    });

    return result;
  }

  async doubleWheelReward(
    wheelReward: DailyWheelRewardResult,
  ): Promise<DailyWheelRewardResult | null> {
    if (wheelReward.doubled || !wheelReward.amount) return null;
    if (wheelReward.reward.type === 'baseAvatar') return null;

    const user = await firstValueFrom(this.auth.user$);

    if (!user) return null;

    if (wheelReward.reward.type === 'coins') {
      const userRef = doc(this.firestore, `users/${user.uid}`);

      await setDoc(
        userRef,
        {
          stats: {
            coins: increment(wheelReward.amount),
          },
        },
        { merge: true },
      );
    }

    if (wheelReward.reward.type === 'xp') {
      await this.userStatsService.addXp(user.uid, wheelReward.amount);
    }

    return {
      ...wheelReward,
      doubled: true,
      amount: wheelReward.amount * 2,
      label:
        wheelReward.reward.type === 'coins'
          ? `+${wheelReward.amount * 2} TurtleCoins`
          : `+${wheelReward.amount * 2} XP`,
    };
  }

  async completeDailyChallenge(
    correctAnswers: number,
    totalQuestions: number,
    helpsUsed: number,
  ): Promise<{ rewardCoins: number; alreadyClaimed: boolean }> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return { rewardCoins: 0, alreadyClaimed: true };

    const userRef = doc(this.firestore, `users/${user.uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) {
        return { rewardCoins: 0, alreadyClaimed: true };
      }

      const data = snapshot.data();
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const alreadyClaimed =
        dailyEvents.dailyChallenge.rewardClaimedDate === this.todayKey;

      dailyEvents.metrics.dailyChallengeCompleted = 1;
      dailyEvents.metrics.dailyChallengeQuestions = Math.max(
        dailyEvents.metrics.dailyChallengeQuestions ?? 0,
        totalQuestions,
      );
      dailyEvents.metrics.dailyChallengeCorrect = Math.max(
        dailyEvents.metrics.dailyChallengeCorrect ?? 0,
        correctAnswers,
      );

      if (correctAnswers === totalQuestions) {
        dailyEvents.metrics.dailyChallengePerfect = 1;
      }

      if (helpsUsed === 0) {
        dailyEvents.metrics.dailyChallengeNoHelp = 1;
      }

      dailyEvents.dailyChallenge.completedDate = this.todayKey;
      dailyEvents.dailyChallenge.bestCorrectToday = Math.max(
        dailyEvents.dailyChallenge.bestCorrectToday ?? 0,
        correctAnswers,
      );

      const updates: UpdateData<DocumentData> = {
        dailyEvents,
        'stats.lastQuizPlayedAt': serverTimestamp(),
      };

      if (!alreadyClaimed) {
        dailyEvents.dailyChallenge.rewardClaimedDate = this.todayKey;
        updates['dailyEvents'] = dailyEvents;
        updates['stats.coins'] = increment(this.dailyChallengeCoinsReward);
      }

      transaction.update(userRef, updates);

      return {
        rewardCoins: alreadyClaimed ? 0 : this.dailyChallengeCoinsReward,
        alreadyClaimed,
      };
    });
  }

  async doubleDailyChallengeReward(): Promise<number> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return 0;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return 0;

      const data = snapshot.data();
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const canDouble =
        dailyEvents.dailyChallenge.rewardClaimedDate === this.todayKey &&
        dailyEvents.dailyChallenge.rewardDoubledDate !== this.todayKey;

      if (!canDouble) return 0;

      dailyEvents.dailyChallenge.rewardDoubledDate = this.todayKey;

      transaction.update(userRef, {
        dailyEvents,
        'stats.coins': increment(this.dailyChallengeCoinsReward),
      });

      return this.dailyChallengeCoinsReward;
    });
  }

  private async getTodayData(uid: string): Promise<DailyEventsData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    const rawDailyEvents = data['dailyEvents'] as
      | Partial<DailyEventsData>
      | undefined;
    const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);

    if (dailyEvents.dateKey !== rawDailyEvents?.dateKey) {
      await setDoc(userRef, { dailyEvents }, { merge: true });
    }

    return dailyEvents;
  }

  private normalizeDailyEventsData(rawData: unknown): DailyEventsData {
    const fallback = this.getDefaultDailyEventsData();
    const data = rawData as Partial<DailyEventsData> | undefined;

    if (!data || data.dateKey !== this.todayKey) return fallback;

    return {
      dateKey: data.dateKey,
      metrics: {
        ...fallback.metrics,
        ...(data.metrics ?? {}),
      },
      missionClaims: data.missionClaims ?? {},
      wheel: {
        ...fallback.wheel,
        ...(data.wheel ?? {}),
      },
      dailyChallenge: {
        ...fallback.dailyChallenge,
        ...(data.dailyChallenge ?? {}),
      },
    };
  }

  private getDefaultDailyEventsData(): DailyEventsData {
    return {
      dateKey: this.todayKey,
      metrics: {},
      missionClaims: {},
      wheel: {
        freeSpinDate: null,
        spinsToday: 0,
      },
      dailyChallenge: {
        completedDate: null,
        rewardClaimedDate: null,
        rewardDoubledDate: null,
        bestCorrectToday: 0,
      },
    };
  }

  private getWeightedWheelReward(): DailyWheelRewardConfig {
    const totalWeight = DAILY_WHEEL_REWARDS.reduce(
      (sum, reward) => sum + reward.weight,
      0,
    );
    let cursor = Math.random() * totalWeight;

    for (const reward of DAILY_WHEEL_REWARDS) {
      cursor -= reward.weight;

      if (cursor <= 0) return reward;
    }

    return DAILY_WHEEL_REWARDS[0];
  }

  private getRandomLockedBaseAvatar(unlockedAvatarIds: string[]) {
    const baseAvatars = AVATARS.filter(
      (avatar) =>
        avatar.source === 'base' &&
        avatar.id !== 'letter' &&
        !unlockedAvatarIds.includes(avatar.id),
    );

    if (baseAvatars.length === 0) return null;

    return baseAvatars[Math.floor(Math.random() * baseAvatars.length)];
  }

  private getPlanIndex(): number {
    /*
     * I piani in configurazione sono Lun-Dom. JavaScript invece usa
     * Dom-Sab, quindi rimappiamo per mantenere le missioni intuitive.
     */
    const weekday = this.getDebugWeekday() ?? new Date().getDay();

    return weekday === 0 ? 6 : weekday - 1;
  }

  private get todayKey(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
