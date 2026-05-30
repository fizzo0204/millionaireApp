import { Injectable } from '@angular/core';
import { serverTimestamp } from '@angular/fire/firestore';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  DailyReward,
  DailyRewardClaimPayload,
  DailyChestReward,
  DailyRewardState,
  UserDailyRewardData,
} from 'src/app/models/daily-reward.model';
import {
  DAILY_REWARDS,
  EPIC_CHEST_REWARDS,
} from 'src/app/data/daily-rewards.data';
import { AVATARS } from 'src/app/data/avatars.data';
import { AvatarModel } from 'src/app/models/avatar.model';
import { DAILY_REWARD_CONFIG } from 'src/app/config/daily-reward.config';
import { AuthService } from 'src/app/services/auth.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

@Injectable({
  providedIn: 'root',
})
export class DailyRewardService {
  private readonly storageKey = DAILY_REWARD_CONFIG.storageKeys.reward;
  private readonly unlockedAvatarsKey =
    DAILY_REWARD_CONFIG.storageKeys.unlockedAvatars;
  private readonly selectedAvatarKey = 'profile_avatar';

  private userSub?: Subscription;

  private cachedDailyReward: UserDailyRewardData = {
    currentDay: 1,
    lastClaimDate: null,
    lastClaimedAt: null,
    claimedToday: false,
  };

  private cachedAvatar = {
    selectedAvatar: 'letter',
    unlockedAvatarIds: [] as string[],
  };

  readonly rewards: DailyReward[] = DAILY_REWARDS;
  readonly epicChestRewards: DailyChestReward[] = EPIC_CHEST_REWARDS;

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
  ) {
    this.listenToUser();
  }

  get dailyAvatars(): AvatarModel[] {
    return AVATARS.filter((avatar) => avatar.source === 'daily');
  }

  get epicAvatars(): AvatarModel[] {
    return AVATARS.filter((avatar) => avatar.source === 'epic');
  }

  getState(): DailyRewardState {
    return {
      currentDay: this.cachedDailyReward.currentDay,
      lastClaimDate: this.cachedDailyReward.lastClaimDate,
      lastClaimedAt: this.cachedDailyReward.lastClaimedAt ?? null,
      claimedToday:
        this.cachedDailyReward.lastClaimDate === this.getTodayKey() ||
        this.isClaimCooldownActive(this.cachedDailyReward.lastClaimedAt),
    };
  }

  getCurrentReward(): DailyReward {
    return this.getRewardForDay(this.getState().currentDay);
  }

  getRewardForDay(day: number): DailyReward {
    const normalizedDay = Math.min(
      Math.max(day, 1),
      DAILY_REWARD_CONFIG.maxDay,
    );

    return this.rewards[normalizedDay - 1];
  }

  getRandomDailyAvatar(): AvatarModel {
    const avatars = this.dailyAvatars;
    const index = Math.floor(Math.random() * avatars.length);

    return avatars[index];
  }

  getRandomEpicAvatar(): AvatarModel | undefined {
    const avatars = this.epicAvatars;

    if (avatars.length === 0) return undefined;

    const index = Math.floor(Math.random() * avatars.length);

    return avatars[index];
  }

  async claimToday(): Promise<void> {
    await this.claimTodayWithReward({
      rewardDay: this.getState().currentDay,
    });
  }

  async claimTodayWithReward(
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<boolean> {
    const user = await firstValueFrom(this.auth.user$);

    const state = this.getState();
    const todayKey = this.getTodayKey();

    if (state.claimedToday || rewardPayload.rewardDay !== state.currentDay) {
      return false;
    }

    const nextDay =
      state.currentDay >= DAILY_REWARD_CONFIG.maxDay ? 1 : state.currentDay + 1;

    const updatedData: UserDailyRewardData = {
      currentDay: nextDay,
      lastClaimDate: todayKey,
      lastClaimedAt: new Date().toISOString(),
      claimedToday: true,
    };

    if (!user) {
      this.cachedDailyReward = updatedData;

      if (
        rewardPayload.avatarId &&
        !this.cachedAvatar.unlockedAvatarIds.includes(rewardPayload.avatarId)
      ) {
        this.cachedAvatar = {
          ...this.cachedAvatar,
          unlockedAvatarIds: [
            ...this.cachedAvatar.unlockedAvatarIds,
            rewardPayload.avatarId,
          ],
        };

        this.saveLocalUnlockedAvatarsFallback();
      }

      this.saveLocalFallback();
      return true;
    }

    const claimedDailyReward = await this.userStatsService.claimDailyReward(
      user.uid,
      todayKey,
      state.currentDay,
      DAILY_REWARD_CONFIG.maxDay,
      rewardPayload,
    );

    if (!claimedDailyReward) {
      await this.refreshRemoteCache(user.uid);
      return false;
    }

    this.cachedDailyReward = claimedDailyReward;

    if (
      rewardPayload.avatarId &&
      !this.cachedAvatar.unlockedAvatarIds.includes(rewardPayload.avatarId)
    ) {
      this.cachedAvatar = {
        ...this.cachedAvatar,
        unlockedAvatarIds: [
          ...this.cachedAvatar.unlockedAvatarIds,
          rewardPayload.avatarId,
        ],
      };
    }

    return true;
  }

  async applyRewardBonus(
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<boolean> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return false;

    if (
      (!rewardPayload.coins || rewardPayload.coins <= 0) &&
      (!rewardPayload.xp || rewardPayload.xp <= 0)
    ) {
      return false;
    }

    return this.userStatsService.applyDailyRewardBonus(
      user.uid,
      rewardPayload,
    );
  }

  async simulateDay(day: number): Promise<void> {
    await this.setDebugDay(day);
  }

  async resetDailyReward(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    const updatedData: Partial<UserDailyRewardData> = {
      currentDay: 1,
      lastClaimDate: null,
      lastClaimedAt: null,
      claimedToday: false,
    };

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      ...updatedData,
    };

    localStorage.removeItem(this.storageKey);

    if (!user) return;

    await this.userStatsService.updateDailyRewardData(user.uid, updatedData);
  }

  async saveUnlockedAvatar(avatar: AvatarModel): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (this.cachedAvatar.unlockedAvatarIds.includes(avatar.id)) return;

    this.cachedAvatar = {
      ...this.cachedAvatar,
      unlockedAvatarIds: [...this.cachedAvatar.unlockedAvatarIds, avatar.id],
    };

    if (!user) {
      this.saveLocalUnlockedAvatarsFallback();
      return;
    }

    await this.userStatsService.unlockDailyAvatar(user.uid, avatar.id);
  }

  async refreshAvatarCacheForCurrentUser(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      this.loadLocalFallback();
      return;
    }

    await this.refreshRemoteCache(user.uid);
  }

  getUnlockedAvatarIds(): string[] {
    return this.cachedAvatar.unlockedAvatarIds;
  }

  getUnlockedAvatars(): AvatarModel[] {
    return AVATARS.filter((avatar) =>
      this.cachedAvatar.unlockedAvatarIds.includes(avatar.id),
    );
  }

  async setDebugDay(day: number): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    const normalizedDay = Math.min(
      Math.max(day, 1),
      DAILY_REWARD_CONFIG.maxDay,
    );

    const updatedData: Partial<UserDailyRewardData> = {
      currentDay: normalizedDay,
      lastClaimDate: null,
      lastClaimedAt: null,
      claimedToday: false,
    };

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      ...updatedData,
    };

    if (!user) {
      this.saveLocalFallback();
      return;
    }

    await this.userStatsService.updateDailyRewardData(user.uid, updatedData);
  }

  async resetUnlockedAvatars(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    this.cachedAvatar = {
      ...this.cachedAvatar,
      unlockedAvatarIds: [],
    };

    localStorage.removeItem(this.unlockedAvatarsKey);

    if (!user) return;

    await this.userStatsService.updateAvatarData(user.uid, {
      unlockedAvatarIds: [],
    });
  }

  getRandomEpicChestReward(): DailyChestReward {
    const index = Math.floor(Math.random() * this.epicChestRewards.length);

    return this.epicChestRewards[index];
  }

  getSelectedAvatar(): string {
    return this.cachedAvatar.selectedAvatar;
  }

  async saveSelectedAvatar(avatarId: string): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    this.cachedAvatar = {
      ...this.cachedAvatar,
      selectedAvatar: avatarId,
    };

    if (!user) {
      localStorage.setItem(this.selectedAvatarKey, avatarId);
      return;
    }

    await this.userStatsService.saveSelectedAvatar(user.uid, avatarId);
  }

  private listenToUser(): void {
    this.userSub = this.auth.user$.subscribe(async (user) => {
      if (!user) {
        this.loadLocalFallback();
        return;
      }

      if (user.isAnonymous) {
        await this.migrateLocalFallbackToRemote(user.uid);
      }

      await this.refreshRemoteCache(user.uid);
    });
  }

  private async migrateLocalFallbackToRemote(uid: string): Promise<void> {
    /*
     * Prima l'anonimo usava localStorage per daily reward e avatar.
     * Ora l'ospite e un profilo Firestore: copiamo una sola volta quei dati
     * locali nel documento dell'utente anonimo, cosi chi aveva gia giocato
     * non perde le ricompense ottenute.
     */
    const savedState = localStorage.getItem(this.storageKey);
    const savedAvatars = localStorage.getItem(this.unlockedAvatarsKey);
    const selectedAvatar = localStorage.getItem(this.selectedAvatarKey);

    if (!savedState && !savedAvatars && !selectedAvatar) return;

    if (savedState) {
      const state = JSON.parse(savedState) as Partial<DailyRewardState>;

      await this.userStatsService.updateDailyRewardData(uid, {
        currentDay: state.currentDay ?? 1,
        lastClaimDate: state.lastClaimDate ?? null,
        lastClaimedAt: state.lastClaimDate ? serverTimestamp() : null,
        claimedToday: state.lastClaimDate === this.getTodayKey(),
      });
    }

    if (savedAvatars || selectedAvatar) {
      const remoteAvatar = await this.userStatsService.getAvatarData(uid);
      const localAvatarIds = this.parseLocalAvatarIds(savedAvatars);

      await this.userStatsService.updateAvatarData(uid, {
        selectedAvatar: selectedAvatar ?? remoteAvatar.selectedAvatar,
        unlockedAvatarIds: Array.from(
          new Set([...remoteAvatar.unlockedAvatarIds, ...localAvatarIds]),
        ),
      });
    }

    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.unlockedAvatarsKey);
    localStorage.removeItem(this.selectedAvatarKey);
  }

  private async refreshRemoteCache(uid: string): Promise<void> {
    const dailyReward = await this.userStatsService.getDailyRewardData(uid);

    const profile = await firstValueFrom(
      this.userStatsService.getUserProfile(uid),
    );

    this.cachedDailyReward = {
      ...dailyReward,
      claimedToday:
        dailyReward.lastClaimDate === this.getTodayKey() ||
        this.isClaimCooldownActive(dailyReward.lastClaimedAt),
    };

    this.cachedAvatar = {
      selectedAvatar: profile?.avatar?.selectedAvatar ?? 'letter',
      unlockedAvatarIds: profile?.avatar?.unlockedAvatarIds ?? [],
    };
  }

  private parseLocalAvatarIds(savedAvatars: string | null): string[] {
    if (!savedAvatars) return [];

    const parsedAvatars: unknown[] = JSON.parse(savedAvatars);

    return parsedAvatars
      .map((item: any) => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean);
  }

  private loadLocalFallback(): void {
    const savedState = localStorage.getItem(this.storageKey);
    const savedAvatars = localStorage.getItem(this.unlockedAvatarsKey);
    const selectedAvatar =
      localStorage.getItem(this.selectedAvatarKey) || 'letter';

    const state: DailyRewardState = savedState
      ? JSON.parse(savedState)
      : {
          currentDay: 1,
          lastClaimDate: null,
          lastClaimedAt: null,
          claimedToday: false,
        };

    const unlockedAvatarIds = this.parseLocalAvatarIds(savedAvatars);

    this.cachedDailyReward = {
      currentDay: state.currentDay,
      lastClaimDate: state.lastClaimDate,
      lastClaimedAt: state.lastClaimedAt ?? null,
      claimedToday:
        state.lastClaimDate === this.getTodayKey() ||
        this.isClaimCooldownActive(state.lastClaimedAt),
    };

    this.cachedAvatar = {
      selectedAvatar,
      unlockedAvatarIds,
    };
  }

  private saveLocalFallback(): void {
    const state: DailyRewardState = {
      currentDay: this.cachedDailyReward.currentDay,
      lastClaimDate: this.cachedDailyReward.lastClaimDate,
      lastClaimedAt: this.cachedDailyReward.lastClaimedAt ?? null,
      claimedToday: this.cachedDailyReward.claimedToday,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  private saveLocalUnlockedAvatarsFallback(): void {
    localStorage.setItem(
      this.unlockedAvatarsKey,
      JSON.stringify(this.cachedAvatar.unlockedAvatarIds),
    );
  }

  private getTodayKey(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private isClaimCooldownActive(value: unknown): boolean {
    const lastClaimedAt = this.toDate(value);

    if (!lastClaimedAt) return false;

    const cooldownMs = 24 * 60 * 60 * 1000;

    return Date.now() - lastClaimedAt.getTime() < cooldownMs;
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
