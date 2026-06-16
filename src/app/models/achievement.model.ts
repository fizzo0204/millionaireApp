export type AchievementRewardType =
  | 'pending'
  | 'coins'
  | 'xp'
  | 'avatar'
  | 'title';
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
  titleId?: string;
  titleIcon?: string;
  titleLabel?: string;
  titleRarity?: AchievementRarity;
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
  rewardClaimed?: boolean;
  rewardAvailable?: boolean;
}
