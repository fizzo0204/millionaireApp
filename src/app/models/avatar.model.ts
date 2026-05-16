export type AvatarSource = 'base' | 'daily';

export type AvatarRarity = 'common' | 'rare' | 'epic';

export interface AvatarModel {
  id: string;
  label: string;
  icon?: string;
  minLevel: number;
  source?: AvatarSource;
  rarity?: AvatarRarity;
}
