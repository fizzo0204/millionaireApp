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
  runTransaction,
  setDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import {
  DAILY_MISSION_PLANS,
  DAILY_MISSION_SWITCH_POOL,
} from 'src/app/config/daily-events.config';
import { STORAGE_KEYS } from 'src/app/config/storage-keys.config';
import {
  DailyEventsData,
  DailyMissionConfig,
  DailyMissionMetric,
  DailyMissionView,
} from 'src/app/models/daily-events.model';
import { AuthService } from './auth.service';
import { UserStatsService } from './user-stats.service';

interface MissionNotificationResult {
  notificationCount: number | null;
}

interface MissionClaimResult {
  rewardCoins: number;
  finalRewardCoins: number;
  finalRewardClaimed: boolean;
  notificationCount: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class DailyMissionService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private auth = inject(AuthService);
  private userStatsService = inject(UserStatsService);
  private readonly dailyCooldownMs = 24 * 60 * 60 * 1000;
  private readonly finalMissionsRewardCoins = 25;

  // Recupera il piano missioni previsto per il giorno corrente.
  getTodayPlan(): DailyMissionConfig[] {
    return DAILY_MISSION_PLANS[this.getPlanIndex()] ?? DAILY_MISSION_PLANS[0];
  }

  // Recupera le missioni giornaliere con progressi, stato claim e stato switch.
  async getTodayMissions(): Promise<{
    missions: DailyMissionView[];
    notificationCount: number;
  }> {
    const user = await firstValueFrom(this.auth.user$);
    const data = user
      ? await this.getTodayData(user.uid)
      : this.getDefaultDailyEventsData();

    const resolvedPlan = this.getTodayResolvedPlan(data);
    const basePlan = this.getTodayPlan();
    const notificationCount = this.getNotificationCountFromData(data);

    const missions = resolvedPlan.map((mission, index) => {
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
          originalMission.metric !== 'adsWatched' && !claimed && !completed,
        switchRequiresAd: switched,
      };
    });

    return { missions, notificationCount };
  }

  // Recupera i dati giornalieri dell'utente corrente oppure il default se non loggato.
  async getTodayDataForCurrentUser(): Promise<DailyEventsData> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return this.getDefaultDailyEventsData();

    return this.getTodayData(user.uid);
  }

  // Sincronizza i dati giornalieri e segnala eventuale cambio giorno.
  async syncTodayDataForCurrentUser(): Promise<{
    notificationCount: number;
    dayChanged: boolean;
  }> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      return { notificationCount: 0, dayChanged: false };
    }

    const result = await this.getTodayDataWithDayChange(user.uid);

    return {
      notificationCount: this.getNotificationCountFromData(result.data),
      dayChanged: result.dayChanged,
    };
  }

  // Resetta i dati dailyEvents dell'utente corrente.
  async resetDailyEventsDebug(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await this.runFirestore(() =>
      setDoc(
        userRef,
        {
          dailyEvents: this.getDefaultDailyEventsData(),
        },
        { merge: true },
      ),
    );
  }

  // Cambia una missione giornaliera con una missione alternativa valida.
  // La prima sostituzione resta gratuita; dalla seconda in poi il video
  // viene gestito dalla pagina prima di chiamare questo metodo.
  async switchDailyMission(originalMissionId: string): Promise<{
    replacement: DailyMissionConfig | null;
    notificationCount: number | null;
  }> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return { replacement: null, notificationCount: null };

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;

    const replacement = await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
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
      }),
    );

    return {
      replacement,
      notificationCount: updatedDailyEvents
        ? this.getNotificationCountFromData(updatedDailyEvents)
        : null,
    };
  }

  // Aggiorna il progresso di una metrica missione.
  async trackMissionProgress(
    metric: DailyMissionMetric,
    amount = 1,
    mode: 'increment' | 'max' = 'increment',
  ): Promise<MissionNotificationResult> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return { notificationCount: null };

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
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
      }),
    );

    return {
      notificationCount: updatedDailyEvents
        ? this.getNotificationCountFromData(updatedDailyEvents)
        : null,
    };
  }

  // Riscatta il premio di una missione giornaliera completata.
  // Se dopo questo riscatto risultano riscattate tutte le missioni,
  // assegna anche il premio finale giornaliero una sola volta.
  async claimMissionReward(missionId: string): Promise<MissionClaimResult> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      return {
        rewardCoins: 0,
        finalRewardCoins: 0,
        finalRewardClaimed: false,
        notificationCount: null,
      };
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;
    let finalRewardCoins = 0;
    let finalRewardClaimed = false;

    const rewardCoins = await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return 0;

        const data = snapshot.data();
        const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
        const resolvedPlan = this.getTodayResolvedPlan(dailyEvents);
        const mission = resolvedPlan.find((item) => item.id === missionId);

        if (!mission) return 0;

        const progress = this.getMissionProgress(dailyEvents, mission);

        if (
          dailyEvents.missionClaims[mission.id] ||
          progress < mission.target
        ) {
          return 0;
        }

        const stats = data['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.userStatsService.defaultStats.coins;

        dailyEvents.missionClaims[mission.id] = true;

        if (this.canClaimFinalMissionsReward(dailyEvents, resolvedPlan)) {
          finalRewardCoins = this.finalMissionsRewardCoins;
          finalRewardClaimed = true;
          dailyEvents.missionsFinalReward = {
            claimedDate: this.todayKey,
            claimedAt: new Date().toISOString(),
            doubledDate: null,
            doubledAt: null,
            rewardCoins: finalRewardCoins,
          };
        }

        updatedDailyEvents = dailyEvents;

        transaction.update(userRef, {
          dailyEvents,
          'stats.coins': currentCoins + mission.rewardCoins + finalRewardCoins,
        });

        return mission.rewardCoins;
      }),
    );

    return {
      rewardCoins,
      finalRewardCoins,
      finalRewardClaimed,
      notificationCount: updatedDailyEvents
        ? this.getNotificationCountFromData(updatedDailyEvents)
        : null,
    };
  }

  // Controlla il premio finale quando l'utente aveva gia riscattato tutto
  // prima della fix oppure rientra nella pagina missioni a 7/7 completato.
  async claimFinalMissionsRewardIfAvailable(): Promise<{
    finalRewardCoins: number;
    finalRewardClaimed: boolean;
    notificationCount: number | null;
  }> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      return {
        finalRewardCoins: 0,
        finalRewardClaimed: false,
        notificationCount: null,
      };
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;
    let finalRewardCoins = 0;
    let finalRewardClaimed = false;

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
        const resolvedPlan = this.getTodayResolvedPlan(dailyEvents);

        if (!this.canClaimFinalMissionsReward(dailyEvents, resolvedPlan)) {
          return;
        }

        const stats = data['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.userStatsService.defaultStats.coins;

        finalRewardCoins = this.finalMissionsRewardCoins;
        finalRewardClaimed = true;
        dailyEvents.missionsFinalReward = {
          claimedDate: this.todayKey,
          claimedAt: new Date().toISOString(),
          rewardCoins: finalRewardCoins,
        };

        updatedDailyEvents = dailyEvents;

        transaction.update(userRef, {
          dailyEvents,
          'stats.coins': currentCoins + finalRewardCoins,
        });
      }),
    );

    return {
      finalRewardCoins,
      finalRewardClaimed,
      notificationCount: updatedDailyEvents
        ? this.getNotificationCountFromData(updatedDailyEvents)
        : null,
    };
  }

  // Raddoppia il premio finale delle 7 missioni giornaliere.
  // Può essere usato una sola volta al giorno, dopo il riscatto del forziere finale.
  async doubleFinalMissionsReward(): Promise<{
    extraCoins: number;
    totalRewardCoins: number;
    notificationCount: number | null;
  }> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      return { extraCoins: 0, totalRewardCoins: 0, notificationCount: null };
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;
    let extraCoins = 0;
    let totalRewardCoins = 0;

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);

        const canDouble =
          dailyEvents.missionsFinalReward.claimedDate === this.todayKey &&
          dailyEvents.missionsFinalReward.doubledDate !== this.todayKey;

        if (!canDouble) return;

        const stats = data['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.userStatsService.defaultStats.coins;

        extraCoins = this.finalMissionsRewardCoins;
        totalRewardCoins =
          (dailyEvents.missionsFinalReward.rewardCoins ??
            this.finalMissionsRewardCoins) + extraCoins;

        dailyEvents.missionsFinalReward = {
          ...dailyEvents.missionsFinalReward,
          doubledDate: this.todayKey,
          doubledAt: new Date().toISOString(),
          rewardCoins: totalRewardCoins,
        };

        updatedDailyEvents = dailyEvents;

        transaction.update(userRef, {
          dailyEvents,
          'stats.coins': currentCoins + extraCoins,
        });
      }),
    );

    return {
      extraCoins,
      totalRewardCoins,
      notificationCount: updatedDailyEvents
        ? this.getNotificationCountFromData(updatedDailyEvents)
        : null,
    };
  }

  // Aggiorna la missione collegata ai video reward completati.
  async trackRewardedAdCompleted(): Promise<MissionNotificationResult> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return { notificationCount: null };

    await this.getTodayData(user.uid);

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);
        const data = snapshot.exists() ? snapshot.data() : {};
        const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);

        dailyEvents.metrics.adsWatched = this.capMetricProgress(
          'adsWatched',
          (dailyEvents.metrics.adsWatched ?? 0) + 1,
          dailyEvents,
        );

        transaction.set(userRef, { dailyEvents }, { merge: true });
        updatedDailyEvents = dailyEvents;
      }),
    );

    return {
      notificationCount: updatedDailyEvents
        ? this.getNotificationCountFromData(updatedDailyEvents)
        : null,
    };
  }

  // Normalizza i dati dailyEvents gestendo cambio giorno e campi mancanti.
  normalizeDailyEventsData(rawData: unknown): DailyEventsData {
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
      missionsFinalReward: {
        ...fallback.missionsFinalReward,
        ...(data.missionsFinalReward ?? {}),
      },
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

  // Crea una struttura dailyEvents pulita per il giorno corrente.
  getDefaultDailyEventsData(): DailyEventsData {
    return {
      dateKey: this.todayKey,
      metrics: {},
      missionClaims: {},
      missionSwitches: {},
      missionProgressBaselines: {},
      missionsFinalReward: {
        claimedDate: null,
        claimedAt: null,
        doubledDate: null,
        doubledAt: null,
        rewardCoins: 0,
      },
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

  // Calcola quante missioni completate hanno ancora un premio da riscuotere.
  getNotificationCountFromData(dailyEvents: DailyEventsData): number {
    return this.getTodayResolvedPlan(dailyEvents).filter((mission) => {
      const progress = this.getMissionProgress(dailyEvents, mission);

      return (
        progress >= mission.target &&
        dailyEvents.missionClaims[mission.id] !== true
      );
    }).length;
  }

  // Recupera il piano giornaliero con eventuali missioni sostituite.
  getTodayResolvedPlan(dailyEvents: DailyEventsData): DailyMissionConfig[] {
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

  // Calcola il progresso effettivo di una missione rispetto alla baseline.
  getMissionProgress(
    dailyEvents: DailyEventsData,
    mission: DailyMissionConfig,
  ): number {
    const rawProgress = dailyEvents.metrics[mission.metric] ?? 0;
    const baseline = dailyEvents.missionProgressBaselines[mission.id] ?? 0;

    return Math.max(0, rawProgress - baseline);
  }

  // Indica se un timestamp rientra ancora nel cooldown giornaliero.
  isCooldownActive(value: unknown): boolean {
    const lastActionAt = this.toDate(value);

    if (!lastActionAt) return false;

    return Date.now() - lastActionAt.getTime() < this.dailyCooldownMs;
  }

  // Recupera i dati dailyEvents e crea/aggiorna il documento se cambia giorno.
  async getTodayData(uid: string): Promise<DailyEventsData> {
    const result = await this.getTodayDataWithDayChange(uid);

    return result.data;
  }

  // Recupera i dati dailyEvents segnalando se è avvenuto un cambio giorno.
  private async getTodayDataWithDayChange(uid: string): Promise<{
    data: DailyEventsData;
    dayChanged: boolean;
  }> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await this.runFirestore(() => getDoc(userRef));
    const data = snapshot.exists() ? snapshot.data() : {};
    const rawDailyEvents = data['dailyEvents'] as
      | Partial<DailyEventsData>
      | undefined;
    const dailyEvents = this.normalizeDailyEventsData(data['dailyEvents']);
    const expiredExistingDay =
      !!rawDailyEvents?.dateKey &&
      dailyEvents.dateKey !== rawDailyEvents.dateKey;

    if (dailyEvents.dateKey !== rawDailyEvents?.dateKey) {
      await this.runFirestore(() =>
        setDoc(userRef, { dailyEvents }, { merge: true }),
      );
    }

    return {
      data: dailyEvents,
      dayChanged: expiredExistingDay,
    };
  }

  // Seleziona una missione alternativa valida per lo switch.
  private getSwitchReplacement(
    dailyEvents: DailyEventsData,
    currentMission: DailyMissionConfig,
  ): DailyMissionConfig | null {
    const resolvedPlan = this.getTodayResolvedPlan(dailyEvents);
    const currentPlanIds = new Set(resolvedPlan.map((mission) => mission.id));
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

  // Verifica se tutte le missioni del giorno sono state riscattate
  // e se il premio finale non e gia stato assegnato oggi.
  private canClaimFinalMissionsReward(
    dailyEvents: DailyEventsData,
    resolvedPlan: DailyMissionConfig[],
  ): boolean {
    if (resolvedPlan.length === 0) return false;
    if (dailyEvents.missionsFinalReward.claimedDate === this.todayKey) {
      return false;
    }

    return resolvedPlan.every(
      (mission) => dailyEvents.missionClaims[mission.id] === true,
    );
  }

  // Limita una metrica al target massimo previsto dalle missioni del giorno.
  private capMetricProgress(
    metric: DailyMissionMetric,
    value: number,
    dailyEvents?: DailyEventsData,
  ): number {
    const target = this.getTodayMetricTarget(metric, dailyEvents);

    if (target === null) return value;

    return Math.min(value, target);
  }

  // Recupera il target massimo di una metrica considerando eventuali baseline.
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

  // Calcola l'indice del piano missioni corrente.
  private getPlanIndex(): number {
    /*
     * I piani in configurazione sono Lun-Dom. JavaScript invece usa
     * Dom-Sab, quindi rimappiamo per mantenere le missioni intuitive.
     */
    const weekday = this.getDebugWeekday() ?? new Date().getDay();

    return weekday === 0 ? 6 : weekday - 1;
  }

  // Legge il giorno debug salvato in localStorage.
  private getDebugWeekday(): number | null {
    const savedValue = localStorage.getItem(
      STORAGE_KEYS.dailyEventsDebugWeekday,
    );

    if (savedValue === null) return null;

    const weekday = Number(savedValue);

    return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? weekday
      : null;
  }

  // Restituisce la chiave data usata per i dati giornalieri.
  private get todayKey(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  // Converte Date, stringhe e Timestamp Firestore in Date.
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

  // Esegue operazioni Firestore nel contesto Angular corretto.
  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
