export interface QuestionModel {
  id: string;
  question: string;
  answers: string[];
  correctIndex: number;
  categoryId?: string;
  difficultyId?: string;
}
