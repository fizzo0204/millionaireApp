import { DifficultyId } from 'src/app/models/difficulty.model';

export const ARCADE_CONFIG = {
  difficultyOrder: ['easy', 'medium', 'hard', 'extreme'] as DifficultyId[],
  baseCoinsPerLevel: 1,
  baseXpPerLevel: 2,
  bonusEveryLevels: 10,
  bonusCoins: 10,
  bonusXp: 20,
  maxTrackedLevel: 10000,
};
