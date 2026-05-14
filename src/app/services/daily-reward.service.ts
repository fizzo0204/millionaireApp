import { Injectable } from '@angular/core';

export type DailyRewardType = 'coins' | 'xp' | 'avatar' | 'chest';

export type DailyReward = {
  day: number;
  type: DailyRewardType;
  amount?: number;
  label: string;
  icon: string;
};

export type DailyRewardState = {
  currentDay: number;
  lastClaimDate: string | null;
  claimedToday: boolean;
};

@Injectable({
  providedIn: 'root',
})
export class DailyRewardService {
  private readonly storageKey = 'turtlemind_daily_reward';

  readonly rewards: DailyReward[] = [
    { day: 1, type: 'coins', amount: 5, label: '+5 Coins', icon: '🪙' },
    { day: 2, type: 'coins', amount: 5, label: '+5 Coins', icon: '🪙' },
    { day: 3, type: 'xp', amount: 10, label: '+10 XP', icon: '⚡' },
    { day: 4, type: 'coins', amount: 5, label: '+5 Coins', icon: '🪙' },
    { day: 5, type: 'avatar', label: 'Avatar', icon: '🎨' },
    { day: 6, type: 'xp', amount: 15, label: '+15 XP', icon: '⚡' },
    { day: 7, type: 'chest', label: 'Epic Chest', icon: '🎁' },
  ];

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
    const normalizedDay = Math.min(Math.max(day, 1), 7);
    return this.rewards[normalizedDay - 1];
  }

  claimToday() {
    const state = this.getState();

    const nextDay = state.currentDay >= 7 ? 1 : state.currentDay + 1;

    const newState: DailyRewardState = {
      currentDay: nextDay,
      lastClaimDate: this.getTodayKey(),
      claimedToday: true,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(newState));
  }

  simulateDay(day: number) {
    const normalizedDay = Math.min(Math.max(day, 1), 7);

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
}
