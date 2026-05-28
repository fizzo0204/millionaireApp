export type AvatarSource = 'base' | 'daily' | 'epic' | 'tutorial';
export type AvatarRarity = 'common' | 'rare' | 'epic';
export type AvatarUnlockType =
  | 'default'
  | 'level'
  | 'daily'
  | 'epicChest'
  | 'tutorial';

export interface AvatarModel {
  id: string;
  label: string;
  icon?: string;
  source: AvatarSource;
  rarity: AvatarRarity;
  unlockType: AvatarUnlockType;
  minLevel?: number;
  dailyRewardDay?: number;
}
