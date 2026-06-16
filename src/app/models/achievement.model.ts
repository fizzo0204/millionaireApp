export type AchievementRewardType = 'pending' | 'coins' | 'xp' | 'avatar';
export type AchievementRarity =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'epic'
  | 'legendary';

export interface AchievementRewardModel {
  type: AchievementRewardType;
  label: string;
  amount?: number;
  avatarId?: string;
}

export interface AchievementModel {
  id?: string;
  icon: string;
  title: string;
  description: string;
  completed: boolean;
  progress?: string;
  progressValue?: number;
  reward?: AchievementRewardModel;
  rarity?: AchievementRarity;
}
