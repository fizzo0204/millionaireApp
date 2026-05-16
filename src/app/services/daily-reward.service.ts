import { Injectable } from '@angular/core';
import {
  DailyReward,
  DailyAvatarReward,
  DailyChestReward,
  DailyRewardState,
} from 'src/app/models/daily-reward.model';
import {
  DAILY_REWARDS,
  DAILY_AVATARS,
  EPIC_CHEST_REWARDS,
} from 'src/app/data/daily-rewards.data';
import { DAILY_REWARD_CONFIG } from 'src/app/config/daily-reward.config';

@Injectable({
  providedIn: 'root',
})
export class DailyRewardService {
  private readonly storageKey = DAILY_REWARD_CONFIG.storageKeys.reward;
  private readonly unlockedAvatarsKey =
    DAILY_REWARD_CONFIG.storageKeys.unlockedAvatars;

  readonly rewards: DailyReward[] = DAILY_REWARDS;

  readonly dailyAvatars: DailyAvatarReward[] = DAILY_AVATARS;

  readonly epicChestRewards: DailyChestReward[] = EPIC_CHEST_REWARDS;

  getState(): DailyRewardState {
    const saved = localStorage.getItem(this.storageKey);

    if (!saved) {
      return {
        currentDay: 1,
        lastClaimDate: null,
        claimedToday: false,
      };
    }

    const state = JSON.parse(saved) as DailyRewardState;

    return {
      ...state,
      claimedToday: state.lastClaimDate === this.getTodayKey(),
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

  claimToday() {
    const state = this.getState();
    const nextDay =
      state.currentDay >= DAILY_REWARD_CONFIG.maxDay ? 1 : state.currentDay + 1;

    const newState: DailyRewardState = {
      currentDay: nextDay,
      lastClaimDate: this.getTodayKey(),
      claimedToday: true,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(newState));
  }

  simulateDay(day: number) {
    const normalizedDay = Math.min(
      Math.max(day, 1),
      DAILY_REWARD_CONFIG.maxDay,
    );

    const state: DailyRewardState = {
      currentDay: normalizedDay,
      lastClaimDate: null,
      claimedToday: false,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  resetDailyReward() {
    localStorage.removeItem(this.storageKey);
  }

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  saveUnlockedAvatar(avatar: DailyAvatarReward) {
    const saved = localStorage.getItem(this.unlockedAvatarsKey);

    const avatars: DailyAvatarReward[] = saved ? JSON.parse(saved) : [];

    const alreadyUnlocked = avatars.some((item) => item.id === avatar.id);

    if (alreadyUnlocked) return;

    avatars.push(avatar);

    localStorage.setItem(this.unlockedAvatarsKey, JSON.stringify(avatars));
  }

  getUnlockedAvatars(): DailyAvatarReward[] {
    const saved = localStorage.getItem(this.unlockedAvatarsKey);

    return saved ? JSON.parse(saved) : [];
  }

  setDebugDay(day: number) {
    const normalizedDay = Math.min(
      Math.max(day, 1),
      DAILY_REWARD_CONFIG.maxDay,
    );

    const state: DailyRewardState = {
      currentDay: normalizedDay,
      lastClaimDate: null,
      claimedToday: false,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  resetUnlockedAvatars() {
    localStorage.removeItem(this.unlockedAvatarsKey);
  }

  getRandomEpicChestReward(): DailyChestReward {
    const index = Math.floor(Math.random() * this.epicChestRewards.length);

    return this.epicChestRewards[index];
  }
}
