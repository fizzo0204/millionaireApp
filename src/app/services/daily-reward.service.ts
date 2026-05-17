import { Injectable } from '@angular/core';
import { firstValueFrom, Subscription } from 'rxjs';

import {
  DailyReward,
  DailyAvatarReward,
  DailyChestReward,
  DailyRewardState,
  UserDailyRewardData,
} from 'src/app/models/daily-reward.model';

import {
  DAILY_REWARDS,
  DAILY_AVATARS,
  EPIC_CHEST_REWARDS,
} from 'src/app/data/daily-rewards.data';

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

  private userSub?: Subscription;

  private cachedDailyReward: UserDailyRewardData = {
    currentDay: 1,
    lastClaimDate: null,
    claimedToday: false,
    unlockedAvatarIds: [],
    selectedAvatar: 'letter',
  };

  readonly rewards: DailyReward[] = DAILY_REWARDS;
  readonly dailyAvatars: DailyAvatarReward[] = DAILY_AVATARS;
  readonly epicChestRewards: DailyChestReward[] = EPIC_CHEST_REWARDS;

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
  ) {
    this.listenToUser();
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

  getRandomDailyAvatar(): DailyAvatarReward {
    const index = Math.floor(Math.random() * this.dailyAvatars.length);

    return this.dailyAvatars[index];
  }

  async claimToday() {
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

  async simulateDay(day: number) {
    await this.setDebugDay(day);
  }

  async resetDailyReward() {
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

  async saveUnlockedAvatar(avatar: DailyAvatarReward) {
    const user = await firstValueFrom(this.auth.user$);

    const alreadyUnlocked = this.cachedDailyReward.unlockedAvatarIds.includes(
      avatar.id,
    );

    if (alreadyUnlocked) return;

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      unlockedAvatarIds: [
        ...this.cachedDailyReward.unlockedAvatarIds,
        avatar.id,
      ],
    };

    if (!user || user.isAnonymous) {
      this.saveLocalUnlockedAvatarsFallback();
      return;
    }

    await this.userStatsService.unlockDailyAvatar(user.uid, avatar.id);
  }

  getUnlockedAvatars(): DailyAvatarReward[] {
    return this.dailyAvatars.filter((avatar) =>
      this.cachedDailyReward.unlockedAvatarIds.includes(avatar.id),
    );
  }

  async setDebugDay(day: number) {
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

  async resetUnlockedAvatars() {
    const user = await firstValueFrom(this.auth.user$);

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      unlockedAvatarIds: [],
    };

    localStorage.removeItem(this.unlockedAvatarsKey);

    if (!user || user.isAnonymous) return;

    await this.userStatsService.updateDailyRewardData(user.uid, {
      unlockedAvatarIds: [],
    });
  }

  getRandomEpicChestReward(): DailyChestReward {
    const index = Math.floor(Math.random() * this.epicChestRewards.length);

    return this.epicChestRewards[index];
  }

  getSelectedAvatar(): string {
    return this.cachedDailyReward.selectedAvatar;
  }

  async saveSelectedAvatar(avatarId: string) {
    const user = await firstValueFrom(this.auth.user$);

    this.cachedDailyReward = {
      ...this.cachedDailyReward,
      selectedAvatar: avatarId,
    };

    if (!user || user.isAnonymous) {
      localStorage.setItem('profile_avatar', avatarId);
      return;
    }

    await this.userStatsService.saveSelectedAvatar(user.uid, avatarId);
  }

  private listenToUser() {
    this.userSub = this.auth.user$.subscribe(async (user) => {
      if (!user || user.isAnonymous) {
        this.loadLocalFallback();
        return;
      }

      const dailyReward = await this.userStatsService.getDailyRewardData(
        user.uid,
      );

      this.cachedDailyReward = {
        ...dailyReward,
        claimedToday: dailyReward.lastClaimDate === this.getTodayKey(),
        unlockedAvatarIds: dailyReward.unlockedAvatarIds ?? [],
        selectedAvatar: dailyReward.selectedAvatar ?? 'letter',
      };
    });
  }

  private loadLocalFallback() {
    const savedState = localStorage.getItem(this.storageKey);
    const savedAvatars = localStorage.getItem(this.unlockedAvatarsKey);
    const selectedAvatar = localStorage.getItem('profile_avatar') || 'letter';

    const state: DailyRewardState = savedState
      ? JSON.parse(savedState)
      : {
          currentDay: 1,
          lastClaimDate: null,
          claimedToday: false,
        };

    const avatars: DailyAvatarReward[] = savedAvatars
      ? JSON.parse(savedAvatars)
      : [];

    this.cachedDailyReward = {
      currentDay: state.currentDay,
      lastClaimDate: state.lastClaimDate,
      claimedToday: state.lastClaimDate === this.getTodayKey(),
      unlockedAvatarIds: avatars.map((avatar) => avatar.id),
      selectedAvatar,
    };
  }

  private saveLocalFallback() {
    const state: DailyRewardState = {
      currentDay: this.cachedDailyReward.currentDay,
      lastClaimDate: this.cachedDailyReward.lastClaimDate,
      claimedToday: this.cachedDailyReward.claimedToday,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  private saveLocalUnlockedAvatarsFallback() {
    const avatars = this.dailyAvatars.filter((avatar) =>
      this.cachedDailyReward.unlockedAvatarIds.includes(avatar.id),
    );

    localStorage.setItem(this.unlockedAvatarsKey, JSON.stringify(avatars));
  }

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
