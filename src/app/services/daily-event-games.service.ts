import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  DocumentData,
  Firestore,
  UpdateData,
  doc,
  runTransaction,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import {
  DAILY_EVENTS_CONFIG,
  DAILY_WHEEL_REWARDS,
} from 'src/app/config/daily-events.config';
import { AVATARS } from 'src/app/data/avatars.data';
import {
  DailyEventsData,
  DailyWheelRewardConfig,
  DailyWheelRewardResult,
} from 'src/app/models/daily-events.model';
import { getLevelFromXp } from 'src/app/utils/level-progress.util';
import { AuthService } from './auth.service';
import { DailyMissionService } from './daily-mission.service';
import { UserStatsService } from './user-stats.service';

@Injectable({
  providedIn: 'root',
})
export class DailyEventGamesService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private auth = inject(AuthService);
  private userStatsService = inject(UserStatsService);
  private dailyMissionService = inject(DailyMissionService);

  private readonly dailyCooldownMs = 24 * 60 * 60 * 1000;
  private readonly dailyChallengeCoinsReward =
    DAILY_EVENTS_CONFIG.dailyChallengeCoinsReward;
  private readonly duplicateAvatarCoins = 5;

  // Indica se la ruota ha ancora il giro gratuito disponibile.
  isWheelFreeSpinAvailable(data: DailyEventsData | null): boolean {
    if (!data) return true;

    return (
      data.wheel.freeSpinDate !== this.todayKey &&
      !this.isCooldownActive(data.wheel.lastFreeSpinAt)
    );
  }

  // Indica se la daily challenge può ancora assegnare premio oggi.
  isDailyChallengeAvailable(data: DailyEventsData | null): boolean {
    if (!data) return true;

    return (
      data.dailyChallenge.rewardClaimedDate !== this.todayKey &&
      !this.isCooldownActive(data.dailyChallenge.rewardClaimedAt)
    );
  }

  // Esegue un giro della ruota eventi e applica il premio ottenuto.
  async spinWheel(useAdSpin: boolean): Promise<{
    reward: DailyWheelRewardResult | null;
    notificationCount: number | null;
  }> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return { reward: null, notificationCount: null };

    const userRef = doc(this.firestore, `users/${user.uid}`);

    let selectedReward = this.getWeightedWheelReward();
    let rewardResult: DailyWheelRewardResult | null = null;
    let updatedDailyEvents: DailyEventsData | null = null;

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const stats = data['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.userStatsService.defaultStats.coins;
        const currentXp =
          typeof stats?.xp === 'number'
            ? stats.xp
            : this.userStatsService.defaultStats.xp;
        const dailyEvents = this.dailyMissionService.normalizeDailyEventsData(
          data['dailyEvents'],
        );
        const freeSpinAvailable = this.isWheelFreeSpinAvailable(dailyEvents);

        if (!useAdSpin && !freeSpinAvailable) return;

        const avatar = data['avatar'] as
          | { unlockedAvatarIds?: string[]; selectedAvatar?: string }
          | undefined;
        const unlockedAvatarIds = Array.isArray(avatar?.unlockedAvatarIds)
          ? avatar.unlockedAvatarIds
          : [];

        let avatarId: string | undefined;
        let avatarDuplicate = false;
        let avatarConvertedCoins = 0;
        let amount = selectedReward.amount;

        if (selectedReward.type === 'baseAvatar') {
          const dailyAvatar = this.getRandomDailyAvatar();

          if (dailyAvatar) {
            avatarId = dailyAvatar.id;
            avatarDuplicate = unlockedAvatarIds.includes(dailyAvatar.id);
            avatarConvertedCoins = avatarDuplicate
              ? this.duplicateAvatarCoins
              : 0;

            rewardResult = {
              reward: selectedReward,
              label: dailyAvatar.label,
              doubled: false,
              avatarId,
              avatarIcon: dailyAvatar.icon,
              avatarDuplicate,
              convertedCoins: avatarConvertedCoins || undefined,
              amount: avatarConvertedCoins || undefined,
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
          ? new Date()
          : (dailyEvents.wheel.lastFreeSpinAt ?? null);
        dailyEvents.wheel.spinsToday += 1;
        dailyEvents.metrics.wheelSpins = this.capWheelSpins(
          (dailyEvents.metrics.wheelSpins ?? 0) + 1,
          dailyEvents,
        );
        updatedDailyEvents = dailyEvents;

        const updates: UpdateData<DocumentData> = {
          dailyEvents,
        };

        if (selectedReward.type === 'coins' && amount) {
          updates['stats.coins'] = currentCoins + amount;
        }

        if (selectedReward.type === 'baseAvatar' && avatarDuplicate) {
          updates['stats.coins'] = currentCoins + avatarConvertedCoins;
        }

        if (selectedReward.type === 'xp' && amount) {
          const updatedXp = currentXp + amount;

          updates['stats.xp'] = updatedXp;
          updates['stats.level'] = getLevelFromXp(updatedXp);
        }

        if (
          selectedReward.type === 'baseAvatar' &&
          avatarId &&
          !avatarDuplicate
        ) {
          updates['avatar.unlockedAvatarIds'] = [
            ...unlockedAvatarIds,
            avatarId,
          ];
        }

        transaction.update(userRef, updates);

        if (!rewardResult) {
          rewardResult = {
            reward: selectedReward,
            label: selectedReward.label,
            doubled: false,
            amount,
          };
        }
      }),
    );

    return {
      reward: rewardResult,
      notificationCount: updatedDailyEvents
        ? this.dailyMissionService.getNotificationCountFromData(
            updatedDailyEvents,
          )
        : null,
    };
  }

  // Raddoppia il premio della ruota quando il premio è monete o XP.
  async doubleWheelReward(
    wheelReward: DailyWheelRewardResult,
  ): Promise<DailyWheelRewardResult | null> {
    if (wheelReward.doubled || !wheelReward.amount) return null;
    if (wheelReward.reward.type === 'baseAvatar') return null;

    const user = await firstValueFrom(this.auth.user$);
    const rewardAmount = wheelReward.amount;

    if (!user) return null;

    if (wheelReward.reward.type === 'coins') {
      const userRef = doc(this.firestore, `users/${user.uid}`);

      await this.runFirestore(() =>
        runTransaction(this.firestore, async (transaction) => {
          const snapshot = await transaction.get(userRef);

          if (!snapshot.exists()) return;

          const stats = snapshot.data()['stats'] ?? {};
          const currentCoins =
            typeof stats?.coins === 'number'
              ? stats.coins
              : this.userStatsService.defaultStats.coins;

          transaction.update(userRef, {
            'stats.coins': currentCoins + rewardAmount,
          });
        }),
      );
    }

    if (wheelReward.reward.type === 'xp') {
      await this.userStatsService.addXp(user.uid, rewardAmount);
    }

    return {
      ...wheelReward,
      doubled: true,
      amount: rewardAmount * 2,
      label:
        wheelReward.reward.type === 'coins'
          ? `+${rewardAmount * 2} TurtleCoins`
          : `+${rewardAmount * 2} XP`,
    };
  }

  // Completa la daily challenge e assegna il premio se non già riscosso oggi.
  async completeDailyChallenge(
    correctAnswers: number,
    totalQuestions: number,
    helpsUsed: number,
  ): Promise<{
    rewardCoins: number;
    alreadyClaimed: boolean;
    notificationCount: number | null;
  }> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      return { rewardCoins: 0, alreadyClaimed: true, notificationCount: null };
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    let updatedDailyEvents: DailyEventsData | null = null;

    const result = await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) {
          return { rewardCoins: 0, alreadyClaimed: true };
        }

        const data = snapshot.data();
        const stats = data['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.userStatsService.defaultStats.coins;
        const dailyEvents = this.dailyMissionService.normalizeDailyEventsData(
          data['dailyEvents'],
        );
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

        dailyEvents.dailyChallenge.completedDate = this.todayKey;
        dailyEvents.dailyChallenge.completedAt = new Date();
        dailyEvents.dailyChallenge.bestCorrectToday = Math.max(
          dailyEvents.dailyChallenge.bestCorrectToday ?? 0,
          correctAnswers,
        );

        const updates: UpdateData<DocumentData> = {
          dailyEvents,
          'stats.lastQuizPlayedAt': new Date(),
        };

        if (!alreadyClaimed) {
          dailyEvents.dailyChallenge.rewardClaimedDate = this.todayKey;
          dailyEvents.dailyChallenge.rewardClaimedAt = new Date();
          updates['dailyEvents'] = dailyEvents;
          updates['stats.coins'] =
            currentCoins + this.dailyChallengeCoinsReward;
        }

        updatedDailyEvents = dailyEvents;
        transaction.update(userRef, updates);

        return {
          rewardCoins: alreadyClaimed ? 0 : this.dailyChallengeCoinsReward,
          alreadyClaimed,
        };
      }),
    );

    return {
      ...result,
      notificationCount: updatedDailyEvents
        ? this.dailyMissionService.getNotificationCountFromData(
            updatedDailyEvents,
          )
        : null,
    };
  }

  // Raddoppia il premio della daily challenge se non già raddoppiato oggi.
  async doubleDailyChallengeReward(): Promise<number> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return 0;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return 0;

        const data = snapshot.data();
        const stats = data['stats'] ?? {};
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.userStatsService.defaultStats.coins;
        const dailyEvents = this.dailyMissionService.normalizeDailyEventsData(
          data['dailyEvents'],
        );
        const canDouble =
          dailyEvents.dailyChallenge.rewardClaimedDate === this.todayKey &&
          dailyEvents.dailyChallenge.rewardDoubledDate !== this.todayKey;

        if (!canDouble) return 0;

        dailyEvents.dailyChallenge.rewardDoubledDate = this.todayKey;
        dailyEvents.dailyChallenge.rewardDoubledAt = new Date();

        transaction.update(userRef, {
          dailyEvents,
          'stats.coins': currentCoins + this.dailyChallengeCoinsReward,
        });

        return this.dailyChallengeCoinsReward;
      }),
    );
  }

  // Estrae casualmente un premio ruota rispettando i pesi configurati.
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

  // Estrae sempre un avatar daily dalla ruota.
  // Se l'utente lo possiede già, non lo sblocchiamo di nuovo: nel risultato
  // segnaliamo il doppione e lo convertiamo in TurtleCoins.
  private getRandomDailyAvatar() {
    const dailyAvatars = AVATARS.filter(
      (avatar) => avatar.source === 'daily' && avatar.id !== 'letter',
    );

    if (dailyAvatars.length === 0) return null;

    return dailyAvatars[Math.floor(Math.random() * dailyAvatars.length)];
  }

  // Limita il progresso ruota al target giornaliero, se presente.
  private capWheelSpins(value: number, dailyEvents: DailyEventsData): number {
    const plan = this.dailyMissionService.getTodayResolvedPlan(dailyEvents);
    const targets = plan
      .filter((mission) => mission.metric === 'wheelSpins')
      .map((mission) => {
        const baseline = dailyEvents.missionProgressBaselines[mission.id] ?? 0;

        return baseline + mission.target;
      });

    if (targets.length === 0) return value;

    return Math.min(value, Math.max(...targets));
  }

  // Indica se un timestamp rientra ancora nel cooldown giornaliero.
  private isCooldownActive(value: unknown): boolean {
    const lastActionAt = this.toDate(value);

    if (!lastActionAt) return false;

    return Date.now() - lastActionAt.getTime() < this.dailyCooldownMs;
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
