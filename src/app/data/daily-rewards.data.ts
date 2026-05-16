import {
  DailyReward,
  DailyAvatarReward,
  DailyChestReward,
} from '../models/daily-reward.model';

export const DAILY_REWARDS: DailyReward[] = [
  { day: 1, type: 'coins', amount: 5, label: '+5 Coins', icon: '🪙' },
  { day: 2, type: 'coins', amount: 5, label: '+5 Coins', icon: '🪙' },
  { day: 3, type: 'xp', amount: 10, label: '+10 XP', icon: '⚡' },
  { day: 4, type: 'coins', amount: 5, label: '+5 Coins', icon: '🪙' },
  { day: 5, type: 'avatar', label: 'Avatar', icon: '🎨' },
  { day: 6, type: 'xp', amount: 15, label: '+15 XP', icon: '⚡' },
  { day: 7, type: 'chest', label: 'Epic Chest', icon: '🎁' },
];

export const DAILY_AVATARS: DailyAvatarReward[] = [
  {
    id: 'daily_turtle_gold',
    label: 'Turtle',
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

export const EPIC_CHEST_REWARDS: DailyChestReward[] = [
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
