import { DailyReward, DailyChestReward } from '../models/daily-reward.model';

export const DAILY_REWARDS: DailyReward[] = [
  {
    day: 1,
    type: 'coins',
    amount: 5,
    label: '+5 Monete',
    icon: 'assets/ui/coin-turtle.webp',
  },
  {
    day: 2,
    type: 'coins',
    amount: 5,
    label: '+5 Monete',
    icon: 'assets/ui/coin-turtle.webp',
  },
  {
    day: 3,
    type: 'xp',
    amount: 50,
    label: '+50 XP',
    icon: '⚡',
  },
  {
    day: 4,
    type: 'coins',
    amount: 5,
    label: '+5 Monete',
    icon: 'assets/ui/coin-turtle.webp',
  },
  {
    day: 5,
    type: 'avatar',
    label: 'Avatar',
    icon: '🎨',
    avatarPool: 'daily',
  },
  {
    day: 6,
    type: 'xp',
    amount: 75,
    label: '+75 XP',
    icon: '⚡',
  },
  {
    day: 7,
    type: 'chest',
    label: 'Epic Chest',
    icon: '🎁',
  },
];

export const EPIC_CHEST_REWARDS: DailyChestReward[] = [
  {
    type: 'coins',
    amount: 15,
    label: '+15 Monete',
    icon: 'assets/ui/coin-turtle.webp',
    rarity: 'rare',
  },
  {
    type: 'xp',
    amount: 150,
    label: '+150 XP',
    icon: '⚡',
    rarity: 'rare',
  },
  {
    type: 'avatar',
    label: 'Avatar Epico',
    icon: '👑',
    rarity: 'epic',
  },
];
