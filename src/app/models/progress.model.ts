import { DifficultyId } from './difficulty.model';

export interface UserCategoryProgress {
  completedDifficulties: DifficultyId[];
}

export interface CompletedLevelProgress {
  categoryId: string;
  difficultyId: DifficultyId;
  levelNumber: number;
}
