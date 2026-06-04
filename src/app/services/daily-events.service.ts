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
  updateDoc,
} from '@angular/fire/firestore';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';
import {
  DAILY_EVENTS_CONFIG,
  DAILY_MISSION_PLANS,
  DAILY_MISSION_SWITCH_POOL,
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
  private readonly dailyCooldownMs = 24 * 60 * 60 * 1000;
  private rewardedAdProgressQueue = Promise.resolve();
  private dailyNotificationCountSubject = new BehaviorSubject(0);
  private dayChangedSubject = new Subject<void>();

  readonly dailyNotificationCount$ =
    this.dailyNotificationCountSubject.asObservable();
  readonly dayChanged$ = this.dayChangedSubject.asObservable();
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
      this.rewardedAdProgressQueue = this.rewardedAdProgressQueue
        .catch(() => undefined)
        .then(() => this.trackRewardedAdCompleted())
        .catch((error) => {
          console.warn('Missione video non aggiornata:', error);
        });
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

    const resolvedPlan = this.getTodayResolvedPlan(data);
    const basePlan = this.getTodayPlan();
    this.updateNotificationCountFromData(data);

    return resolvedPlan.map((mission, index) => {
      const originalMission = basePlan[index] ?? mission;
      const progress = Math.min(
        this.getMissionProgress(data, mission),
        mission.target,
      );
      const claimed = data.missionClaims[mission.id] === true;
      const completed = progress >= mission.target;
      const switched = originalMission.id !== mission.id;

      return {
        ...mission,
        originalMissionId: originalMission.id,
        progress,
        claimed,
        completed,
        switched,
        canSwitch:
          originalMission.metric !== 'adsWatched' &&
          !data.missionSwitches[originalMission.id] &&
          !claimed &&
          !completed,
      };
    });
  }

  async getTodayDataForCurrentUser(): Promise<DailyEventsData> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return this.getDefaultDailyEventsData();

    return this.getTodayData(user.uid);
  }

  async syncTodayDataForCurrentUser(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      this.dailyNotificationCountSubject.next(0);
      return;
    }

    const data = await this.getTodayData(user.uid);
    this.updateNotificationCountFromData(data);
  }

  async refreshNotificationCount(): Promise<void> {
    await this.syncTodayDataForCurrentUser();
  }

  isWheelFreeSpinAvailable(data: DailyEventsData | null): boolean {
    if (!data) return true;

    return (
      data.wheel.freeSpinDate !== this.todayKey &&
      !this.isCooldownActive(data.wheel.lastFreeSpinAt)
    );
  }

  isDailyChallengeAvailable(data: DailyEventsData | null): boolean {
    if (!data) return true;

    return (
      data.dailyChallenge.rewardClaimedDate !== this.todayKey &&
      !this.isCooldownActive(data.dailyChallenge.rewardClaimedAt)
    );
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

    this.dailyNotificationCountSubject.next(0);
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

  async trackNormalQuizPlayed(): Promise<void> {
    await this.trackMissionProgress('normalQuizPlayed');
  }

  async trackNormalQuizWon(): Promise<void> {
    await this.trackMissionProgress('normalQuizWon');
  }

  async trackNormalHelpUsed(): Promise<void> {
    await this.trackMissionProgress('normalHelpsUsed');
  }

  async trackNormalLevelCompleted(): Promise<void> {
    await this.trackMissionProgress('normalLevelsCompleted');
  }

  async switchDailyMission(
    originalMissionId: string,
  ): Promise<DailyMissionConfig | null> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return null;

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;

    const replacement = await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const data = snapshot.exists() ? snapshot.data() : {};
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const basePlan = this.getTodayPlan();
      const originalMission = basePlan.find(
        (mission) => mission.id === originalMissionId,
      );

      if (!originalMission || originalMission.metric === 'adsWatched') {
        return null;
      }

      if (dailyEvents.missionSwitches[originalMission.id]) {
        return null;
      }

      const currentMission = this.getTodayResolvedPlan(dailyEvents).find(
        (mission, index) => basePlan[index]?.id === originalMission.id,
      );

      if (!currentMission) return null;

      const currentProgress = this.getMissionProgress(
        dailyEvents,
        currentMission,
      );

      if (
        dailyEvents.missionClaims[currentMission.id] ||
        currentProgress >= currentMission.target
      ) {
        return null;
      }

      const replacement = this.getSwitchReplacement(
        dailyEvents,
        currentMission,
      );

      if (!replacement) return null;

      dailyEvents.missionSwitches[originalMission.id] = replacement.id;
      /*
       * La missione sostituita deve contare da questo momento in poi.
       * Se l'utente oggi ha gia completato 5 livelli e pesca "completa 5
       * livelli", vedra 0/5 e dovra farne altri 5.
       */
      dailyEvents.missionProgressBaselines[replacement.id] =
        dailyEvents.metrics[replacement.metric] ?? 0;

      transaction.set(
        userRef,
        {
          dailyEvents,
        },
        { merge: true },
      );

      updatedDailyEvents = dailyEvents;

      return replacement;
    });

    if (updatedDailyEvents) {
      this.updateNotificationCountFromData(updatedDailyEvents);
    }

    return replacement;
  }

  async trackMissionProgress(
    metric: DailyMissionMetric,
    amount = 1,
    mode: 'increment' | 'max' = 'increment',
  ): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const data = snapshot.exists() ? snapshot.data() : {};
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const currentValue = dailyEvents.metrics[metric] ?? 0;

      const nextValue =
        mode === 'max'
          ? Math.max(currentValue, amount)
          : currentValue + amount;

      dailyEvents.metrics[metric] = this.capMetricProgress(
        metric,
        nextValue,
        dailyEvents,
      );

      transaction.set(
        userRef,
        {
          dailyEvents,
        },
        { merge: true },
      );

      updatedDailyEvents = dailyEvents;
    });

    if (updatedDailyEvents) {
      this.updateNotificationCountFromData(updatedDailyEvents);
    }
  }

  async claimMissionReward(missionId: string): Promise<number> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return 0;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    let updatedDailyEvents: DailyEventsData | null = null;

    const rewardCoins = await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return 0;

      const data = snapshot.data();
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const mission = this.getTodayResolvedPlan(dailyEvents).find(
        (item) => item.id === missionId,
      );

      if (!mission) return 0;

      const progress = this.getMissionProgress(dailyEvents, mission);

      if (dailyEvents.missionClaims[mission.id] || progress < mission.target) {
        return 0;
      }

      dailyEvents.missionClaims[mission.id] = true;
      updatedDailyEvents = dailyEvents;

      transaction.update(userRef, {
        dailyEvents,
        'stats.coins': increment(mission.rewardCoins),
      });

      return mission.rewardCoins;
    });

    if (updatedDailyEvents) {
      this.updateNotificationCountFromData(updatedDailyEvents);
    }

    return rewardCoins;
  }

  async spinWheel(useAdSpin: boolean): Promise<DailyWheelRewardResult | null> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return null;
    if (useAdSpin) {
      await this.waitForRewardedAdProgress();
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let selectedReward = this.getWeightedWheelReward();
    let result: DailyWheelRewardResult | null = null;
    let updatedDailyEvents: DailyEventsData | null = null;

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const freeSpinAvailable = this.isWheelFreeSpinAvailable(dailyEvents);

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
      dailyEvents.wheel.lastFreeSpinAt = freeSpinAvailable
        ? serverTimestamp()
        : (dailyEvents.wheel.lastFreeSpinAt ?? null);
      dailyEvents.wheel.spinsToday += 1;
      dailyEvents.metrics.wheelSpins = this.capMetricProgress(
        'wheelSpins',
        (dailyEvents.metrics.wheelSpins ?? 0) + 1,
        dailyEvents,
      );
      updatedDailyEvents = dailyEvents;

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

    if (updatedDailyEvents) {
      this.updateNotificationCountFromData(updatedDailyEvents);
    }

    return result;
  }

  async doubleWheelReward(
    wheelReward: DailyWheelRewardResult,
  ): Promise<DailyWheelRewardResult | null> {
    if (wheelReward.doubled || !wheelReward.amount) return null;
    if (wheelReward.reward.type === 'baseAvatar') return null;

    const user = await firstValueFrom(this.auth.user$);

    if (!user) return null;

    await this.waitForRewardedAdProgress();

    if (wheelReward.reward.type === 'coins') {
      const userRef = doc(this.firestore, `users/${user.uid}`);

      await updateDoc(userRef, {
        'stats.coins': increment(wheelReward.amount),
      });
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
    let updatedDailyEvents: DailyEventsData | null = null;

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) {
        return { rewardCoins: 0, alreadyClaimed: true };
      }

      const data = snapshot.data();
      const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
      const alreadyClaimed = !this.isDailyChallengeAvailable(dailyEvents);

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
      updatedDailyEvents = dailyEvents;

      dailyEvents.dailyChallenge.completedDate = this.todayKey;
      dailyEvents.dailyChallenge.completedAt = serverTimestamp();
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
        dailyEvents.dailyChallenge.rewardClaimedAt = serverTimestamp();
        updates['dailyEvents'] = dailyEvents;
        updates['stats.coins'] = increment(this.dailyChallengeCoinsReward);
      }

      transaction.update(userRef, updates);

      return {
        rewardCoins: alreadyClaimed ? 0 : this.dailyChallengeCoinsReward,
        alreadyClaimed,
      };
    }).finally(() => {
      if (updatedDailyEvents) {
        this.updateNotificationCountFromData(updatedDailyEvents);
      }
    });
  }

  async doubleDailyChallengeReward(): Promise<number> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return 0;

    await this.waitForRewardedAdProgress();

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
      dailyEvents.dailyChallenge.rewardDoubledAt = serverTimestamp();

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
    const expiredExistingDay =
      !!rawDailyEvents?.dateKey && dailyEvents.dateKey !== rawDailyEvents.dateKey;

    if (dailyEvents.dateKey !== rawDailyEvents?.dateKey) {
      await setDoc(userRef, { dailyEvents }, { merge: true });

      if (expiredExistingDay) {
        this.updateNotificationCountFromData(dailyEvents);
        this.dayChangedSubject.next();
      }
    }

    return dailyEvents;
  }

  private async trackRewardedAdCompleted(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    await this.getTodayData(user.uid);

    const userRef = doc(this.firestore, `users/${user.uid}`);

    /*
     * Per il video usiamo un update atomico semplice, non una transazione:
     * il video spesso viene seguito subito da un altro premio e cosi evitiamo
     * collisioni sullo stesso documento utente.
     */
    await updateDoc(userRef, {
      'dailyEvents.metrics.adsWatched': increment(1),
    });

    await this.refreshNotificationCount();
  }

  private async waitForRewardedAdProgress(): Promise<void> {
    await this.rewardedAdProgressQueue.catch(() => undefined);
  }

  private normalizeDailyEventsData(rawData: unknown): DailyEventsData {
    const fallback = this.getDefaultDailyEventsData();
    const data = rawData as Partial<DailyEventsData> | undefined;

    if (!data || data.dateKey !== this.todayKey) {
      return {
        ...fallback,
        wheel: {
          ...fallback.wheel,
          lastFreeSpinAt: data?.wheel?.lastFreeSpinAt ?? null,
        },
        dailyChallenge: {
          ...fallback.dailyChallenge,
          rewardClaimedAt: data?.dailyChallenge?.rewardClaimedAt ?? null,
        },
      };
    }

    return {
      dateKey: data.dateKey,
      metrics: {
        ...fallback.metrics,
        ...(data.metrics ?? {}),
      },
      missionClaims: data.missionClaims ?? {},
      missionSwitches: data.missionSwitches ?? {},
      missionProgressBaselines: data.missionProgressBaselines ?? {},
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
      missionSwitches: {},
      missionProgressBaselines: {},
      wheel: {
        freeSpinDate: null,
        lastFreeSpinAt: null,
        spinsToday: 0,
      },
      dailyChallenge: {
        completedDate: null,
        completedAt: null,
        rewardClaimedDate: null,
        rewardClaimedAt: null,
        rewardDoubledDate: null,
        rewardDoubledAt: null,
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

  private getTodayResolvedPlan(
    dailyEvents: DailyEventsData,
  ): DailyMissionConfig[] {
    return this.getTodayPlan().map((mission) => {
      const replacementId = dailyEvents.missionSwitches[mission.id];

      if (!replacementId) return mission;

      return (
        DAILY_MISSION_SWITCH_POOL.find(
          (replacement) => replacement.id === replacementId,
        ) ?? mission
      );
    });
  }

  private getSwitchReplacement(
    dailyEvents: DailyEventsData,
    currentMission: DailyMissionConfig,
  ): DailyMissionConfig | null {
    const resolvedPlan = this.getTodayResolvedPlan(dailyEvents);
    const currentPlanIds = new Set(
      resolvedPlan.map((mission) => mission.id),
    );
    const currentGoal = `${currentMission.metric}:${currentMission.target}`;
    const currentPlanGoals = new Set(
      resolvedPlan
        .filter((mission) => mission.id !== currentMission.id)
        .map((mission) => `${mission.metric}:${mission.target}`),
    );
    const switchedIds = new Set(Object.values(dailyEvents.missionSwitches));
    const baseCandidates = DAILY_MISSION_SWITCH_POOL.filter((mission) => {
      return (
        mission.id !== currentMission.id &&
        `${mission.metric}:${mission.target}` !== currentGoal &&
        !currentPlanIds.has(mission.id) &&
        !switchedIds.has(mission.id)
      );
    });
    const differentGoalCandidates = baseCandidates.filter(
      (mission) => !currentPlanGoals.has(`${mission.metric}:${mission.target}`),
    );
    const candidates =
      differentGoalCandidates.length > 0
        ? differentGoalCandidates
        : baseCandidates;

    if (candidates.length === 0) return null;

    const incompleteCandidates = candidates.filter((mission) => {
      const progress = this.getMissionProgress(dailyEvents, mission);

      return progress < mission.target;
    });
    const pool =
      incompleteCandidates.length > 0 ? incompleteCandidates : candidates;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  private capMetricProgress(
    metric: DailyMissionMetric,
    value: number,
    dailyEvents?: DailyEventsData,
  ): number {
    const target = this.getTodayMetricTarget(metric, dailyEvents);

    if (target === null) return value;

    return Math.min(value, target);
  }

  private getTodayMetricTarget(
    metric: DailyMissionMetric,
    dailyEvents?: DailyEventsData,
  ): number | null {
    const plan = dailyEvents
      ? this.getTodayResolvedPlan(dailyEvents)
      : this.getTodayPlan();
    const targets = plan
      .filter((mission) => mission.metric === metric)
      .map((mission) => {
        const baseline = dailyEvents?.missionProgressBaselines[mission.id] ?? 0;

        return baseline + mission.target;
      });

    if (targets.length === 0) return null;

    return Math.max(...targets);
  }

  private getMissionProgress(
    dailyEvents: DailyEventsData,
    mission: DailyMissionConfig,
  ): number {
    const rawProgress = dailyEvents.metrics[mission.metric] ?? 0;
    const baseline = dailyEvents.missionProgressBaselines[mission.id] ?? 0;

    return Math.max(0, rawProgress - baseline);
  }

  private updateNotificationCountFromData(dailyEvents: DailyEventsData): void {
    const claimableCount = this.getTodayResolvedPlan(dailyEvents).filter(
      (mission) => {
        const progress = this.getMissionProgress(dailyEvents, mission);

        return (
          progress >= mission.target &&
          dailyEvents.missionClaims[mission.id] !== true
        );
      },
    ).length;

    this.dailyNotificationCountSubject.next(claimableCount);
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

  private isCooldownActive(value: unknown): boolean {
    const lastActionAt = this.toDate(value);

    if (!lastActionAt) return false;

    return Date.now() - lastActionAt.getTime() < this.dailyCooldownMs;
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const parsedDate = new Date(value);

      return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
    }

    const timestampLike = value as { toDate?: () => Date };

    if (typeof timestampLike.toDate === 'function') {
      return timestampLike.toDate();
    }

    return null;
  }
}
