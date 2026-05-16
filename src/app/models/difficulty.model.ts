export type DifficultyId = 'easy' | 'medium' | 'hard' | 'extreme';

export interface DifficultyModel {
  id: DifficultyId;
  title: string;
  subtitle: string;
  icon: string;
  xp: number;
  range: string;
  className?: string;
  locked?: boolean;
  completed?: boolean;
}
