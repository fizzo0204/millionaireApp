export type AvatarSource = 'base' | 'daily' | 'epic';

export type AvatarRarity = 'common' | 'rare' | 'epic';

export type AvatarUnlockType = 'default' | 'level' | 'daily' | 'epicChest';

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
