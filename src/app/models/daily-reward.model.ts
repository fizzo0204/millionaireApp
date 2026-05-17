export type DailyRewardType = 'coins' | 'xp' | 'avatar' | 'chest';

export type RevealType = 'coins' | 'xp' | 'avatar' | 'chest';

export type CinematicPhase = 'opening' | 'flash' | 'reward';

export interface DailyReward {
  day: number;
  type: DailyRewardType;
  amount?: number;
  label: string;
  icon: string;
}

export interface DailyAvatarReward {
  id: string;
  label: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic';
}

export type DailyChestRewardType = 'coins' | 'xp' | 'avatar';

export interface DailyChestReward {
  type: DailyChestRewardType;
  amount?: number;
  label: string;
  icon: string;
  rarity: 'rare' | 'epic';
  avatar?: DailyAvatarReward;
}

export interface DailyRewardState {
  currentDay: number;
  lastClaimDate: string | null;
  claimedToday: boolean;
}

export interface UserDailyRewardData {
  currentDay: number;
  lastClaimDate: string | null;
  claimedToday: boolean;
  unlockedAvatarIds: string[];
  selectedAvatar: string;
}
