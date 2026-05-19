export type DailyRewardType = 'coins' | 'xp' | 'avatar' | 'chest';
export type RevealType = 'coins' | 'xp' | 'avatar' | 'chest';
export type CinematicPhase = 'opening' | 'flash' | 'reward';
export type AvatarRewardPool = 'daily' | 'epic';
export type DailyChestRewardType = 'coins' | 'xp' | 'avatar';

export interface DailyReward {
  day: number;
  type: DailyRewardType;
  amount?: number;
  label: string;
  icon: string;
  avatarPool?: AvatarRewardPool;
}

export interface DailyChestReward {
  type: DailyChestRewardType;
  amount?: number;
  label: string;
  icon: string;
  rarity: 'rare' | 'epic';
  avatarId?: string;
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
}

export interface DailyRewardClaimPayload {
  rewardDay: number;
  coins?: number;
  xp?: number;
  avatarId?: string;
}
