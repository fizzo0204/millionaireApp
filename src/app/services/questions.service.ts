import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  limit,
  query,
  where,
} from '@angular/fire/firestore';

export interface QuizQuestion {
  id?: string;
  category: string;
  difficulty: string;
  levelNumber: number;
  question: string;
  answers: string[];
  correctIndex: number;
  active: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class QuestionsService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  private getSeenKey(
    category: string,
    difficulty: string,
    levelNumber: number,
  ): string {
    return `seen_questions_${category}_${difficulty}_${levelNumber}`;
  }

  private getSeenQuestionIds(
    category: string,
    difficulty: string,
    levelNumber: number,
  ): string[] {
    const key = this.getSeenKey(category, difficulty, levelNumber);
    const raw = localStorage.getItem(key);

    if (!raw) return [];

    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  private saveSeenQuestionId(
    category: string,
    difficulty: string,
    levelNumber: number,
    questionId: string,
  ) {
    const key = this.getSeenKey(category, difficulty, levelNumber);

    const current = this.getSeenQuestionIds(category, difficulty, levelNumber);

    const updated = [questionId, ...current.filter((id) => id !== questionId)];

    localStorage.setItem(key, JSON.stringify(updated.slice(0, 5)));
  }

  getQuestions(
    category: string,
    difficulty: string,
    levelNumber: number,
    amount: number = 1,
  ): Promise<QuizQuestion[]> {
    return runInInjectionContext(this.injector, async () => {
      const questionsRef = collection(this.firestore, 'questions');

      const questionsQuery = query(
        questionsRef,
        where('category', '==', category),
        where('difficulty', '==', difficulty),
        where('levelNumber', '==', levelNumber),
        where('active', '==', true),
      );

      const snapshot = await getDocs(questionsQuery);

      const questions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<QuizQuestion, 'id'>),
      }));

      const seenIds = this.getSeenQuestionIds(
        category,
        difficulty,
        levelNumber,
      );

      let availableQuestions = questions.filter(
        (question) => question.id && !seenIds.includes(question.id),
      );

      if (availableQuestions.length === 0) {
        availableQuestions = questions;
      }

      const selectedQuestions = availableQuestions
        .sort(() => Math.random() - 0.5)
        .slice(0, amount);

      for (const question of selectedQuestions) {
        if (question.id) {
          this.saveSeenQuestionId(
            category,
            difficulty,
            levelNumber,
            question.id,
          );
        }
      }

      return selectedQuestions;
    });
  }
}
