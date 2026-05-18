import { AvatarModel } from '../models/avatar.model';

export const AVATARS: AvatarModel[] = [
  // =========================
  // BASE
  // =========================
  {
    id: 'letter',
    label: 'Iniziale',
    icon: '',
    source: 'base',
    rarity: 'common',
    unlockType: 'default',
    minLevel: 1,
  },

  {
    id: 'crown',
    label: 'Corona',
    icon: '👑',
    source: 'base',
    rarity: 'rare',
    unlockType: 'level',
    minLevel: 3,
  },

  {
    id: 'brain',
    label: 'Genio',
    icon: '🧠',
    source: 'base',
    rarity: 'rare',
    unlockType: 'level',
    minLevel: 5,
  },

  {
    id: 'trophy',
    label: 'Campione',
    icon: '🏆',
    source: 'base',
    rarity: 'epic',
    unlockType: 'level',
    minLevel: 10,
  },

  // =========================
  // DAILY
  // =========================
  {
    id: 'daily_turtle_gold',
    label: 'Tartaruga Gold',
    icon: '🐢',
    source: 'daily',
    rarity: 'rare',
    unlockType: 'daily',
    dailyRewardDay: 5,
  },

  {
    id: 'daily_fire_brain',
    label: 'Fuoco Mentale',
    icon: '🔥',
    source: 'daily',
    rarity: 'rare',
    unlockType: 'daily',
    dailyRewardDay: 5,
  },

  {
    id: 'daily_neon_star',
    label: 'Neon Star',
    icon: '🌟',
    source: 'daily',
    rarity: 'rare',
    unlockType: 'daily',
    dailyRewardDay: 5,
  },

  // =========================
  // EPIC
  // =========================
  {
    id: 'daily_crown_legend',
    label: 'Legend Crown',
    icon: '👑',
    source: 'epic',
    rarity: 'epic',
    unlockType: 'epicChest',
    dailyRewardDay: 7,
  },
];
