export type AvatarSource = 'base' | 'daily' | 'epic' | 'tutorial' | 'special';
export type AvatarRarity = 'common' | 'rare' | 'epic';
export type AvatarUnlockType =
  | 'default'
  | 'level'
  | 'daily'
  | 'epicChest'
  | 'tutorial'
  | 'special';

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
