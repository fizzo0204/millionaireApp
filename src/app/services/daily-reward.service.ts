import { Injectable } from '@angular/core';
import { firstValueFrom, Subscription } from 'rxjs';

import {
  DailyReward,
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
      claimedToday: this.cachedDailyReward.lastClaimDate === this.getTodayKey(),
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
    const user = await firstValueFrom(this.auth.user$);

    const state = this.getState();

    const nextDay =
      state.currentDay >= DAILY_REWARD_CONFIG.maxDay ? 1 : state.currentDay + 1;

    const updatedData: Partial<UserDailyRewardData> = {
      currentDay: nextDay,
      lastClaimDate: this.getTodayKey(),
      claimedToday: true,
    };

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      ...updatedData,
    };

    if (!user || user.isAnonymous) {
      this.saveLocalFallback();
      return;
    }

    await this.userStatsService.updateDailyRewardData(user.uid, updatedData);
  }

  async simulateDay(day: number): Promise<void> {
    await this.setDebugDay(day);
  }

  async resetDailyReward(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    const updatedData: Partial<UserDailyRewardData> = {
      currentDay: 1,
      lastClaimDate: null,
      claimedToday: false,
    };

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      ...updatedData,
    };

    localStorage.removeItem(this.storageKey);

    if (!user || user.isAnonymous) return;

    await this.userStatsService.updateDailyRewardData(user.uid, updatedData);
  }

  async saveUnlockedAvatar(avatar: AvatarModel): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (this.cachedAvatar.unlockedAvatarIds.includes(avatar.id)) return;

    this.cachedAvatar = {
      ...this.cachedAvatar,
      unlockedAvatarIds: [...this.cachedAvatar.unlockedAvatarIds, avatar.id],
    };

    if (!user || user.isAnonymous) {
      this.saveLocalUnlockedAvatarsFallback();
      return;
    }

    await this.userStatsService.unlockDailyAvatar(user.uid, avatar.id);
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
      claimedToday: false,
    };

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      ...updatedData,
    };

    if (!user || user.isAnonymous) {
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

    if (!user || user.isAnonymous) return;

    await this.userStatsService.updateDailyRewardData(user.uid, {
      unlockedAvatarIds: [],
    } as any);
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

    if (!user || user.isAnonymous) {
      localStorage.setItem(this.selectedAvatarKey, avatarId);
      return;
    }

    await this.userStatsService.saveSelectedAvatar(user.uid, avatarId);
  }

  private listenToUser(): void {
    this.userSub = this.auth.user$.subscribe(async (user) => {
      if (!user || user.isAnonymous) {
        this.loadLocalFallback();
        return;
      }

      const dailyReward = await this.userStatsService.getDailyRewardData(
        user.uid,
      );

      const profile = await firstValueFrom(
        this.userStatsService.getUserProfile(user.uid),
      );

      this.cachedDailyReward = {
        ...dailyReward,
        claimedToday: dailyReward.lastClaimDate === this.getTodayKey(),
      };

      this.cachedAvatar = {
        selectedAvatar: profile?.avatar?.selectedAvatar ?? 'letter',
        unlockedAvatarIds: profile?.avatar?.unlockedAvatarIds ?? [],
      };
    });
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
          claimedToday: false,
        };

    const parsedAvatars: unknown[] = savedAvatars
      ? JSON.parse(savedAvatars)
      : [];

    const unlockedAvatarIds = parsedAvatars
      .map((item: any) => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean);

    this.cachedDailyReward = {
      currentDay: state.currentDay,
      lastClaimDate: state.lastClaimDate,
      claimedToday: state.lastClaimDate === this.getTodayKey(),
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
    return new Date().toISOString().slice(0, 10);
  }
}
