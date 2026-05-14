import { Injectable } from '@angular/core';

export type DailyRewardType = 'coins' | 'xp' | 'avatar' | 'chest';

export type DailyReward = {
  day: number;
  type: DailyRewardType;
  amount?: number;
  label: string;
  icon: string;
};

export type DailyAvatarReward = {
  id: string;
  label: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic';
};

export type DailyChestRewardType = 'coins' | 'xp' | 'avatar';

export type DailyChestReward = {
  type: DailyChestRewardType;
  amount?: number;
  label: string;
  icon: string;
  rarity: 'rare' | 'epic';
  avatar?: DailyAvatarReward;
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

  readonly dailyAvatars: DailyAvatarReward[] = [
    {
      id: 'daily_turtle_gold',
      label: 'Golden Turtle',
      icon: '🐢',
      rarity: 'rare',
    },
    {
      id: 'daily_fire_brain',
      label: 'Fire Brain',
      icon: '🔥',
      rarity: 'rare',
    },
    {
      id: 'daily_neon_star',
      label: 'Neon Star',
      icon: '🌟',
      rarity: 'common',
    },
    {
      id: 'daily_crown_legend',
      label: 'Crown Legend',
      icon: '👑',
      rarity: 'epic',
    },
  ];

  readonly epicChestRewards: DailyChestReward[] = [
    {
      type: 'coins',
      amount: 15,
      label: '+15 Coins',
      icon: '🪙',
      rarity: 'rare',
    },
    {
      type: 'xp',
      amount: 30,
      label: '+30 XP',
      icon: '⚡',
      rarity: 'rare',
    },
    {
      type: 'avatar',
      label: 'Avatar Epico',
      icon: '👑',
      rarity: 'epic',
      avatar: {
        id: 'daily_crown_legend',
        label: 'Crown Legend',
        icon: '👑',
        rarity: 'epic',
      },
    },
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

  getRandomDailyAvatar(): DailyAvatarReward {
    const index = Math.floor(Math.random() * this.dailyAvatars.length);

    return this.dailyAvatars[index];
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

  saveUnlockedAvatar(avatar: DailyAvatarReward) {
    const saved = localStorage.getItem('turtlemind_unlocked_avatars');

    const avatars: DailyAvatarReward[] = saved ? JSON.parse(saved) : [];

    const alreadyUnlocked = avatars.some((item) => item.id === avatar.id);

    if (alreadyUnlocked) return;

    avatars.push(avatar);

    localStorage.setItem(
      'turtlemind_unlocked_avatars',
      JSON.stringify(avatars),
    );
  }

  getUnlockedAvatars(): DailyAvatarReward[] {
    const saved = localStorage.getItem('turtlemind_unlocked_avatars');

    return saved ? JSON.parse(saved) : [];
  }

  setDebugDay(day: number) {
    const state: DailyRewardState = {
      currentDay: day,
      lastClaimDate: null,
      claimedToday: false,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  resetUnlockedAvatars() {
    localStorage.removeItem('turtlemind_unlocked_avatars');
  }

  getRandomEpicChestReward(): DailyChestReward {
    const index = Math.floor(Math.random() * this.epicChestRewards.length);

    return this.epicChestRewards[index];
  }
}
