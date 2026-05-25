import { DifficultyId } from './difficulty.model';

export interface QuestionModel {
  id: string;
  question: string;
  answers: string[];
  correctIndex: number;
  category?: string;
  difficulty?: DifficultyId;
  levelNumber?: number;
  active?: boolean;
  categoryId?: string;
  difficultyId?: string;
}
