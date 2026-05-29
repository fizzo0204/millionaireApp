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
  query,
  where,
} from '@angular/fire/firestore';
import { QuestionModel } from 'src/app/models/question.model';
import { DifficultyId } from '../models/difficulty.model';
import { QUESTIONS_CONFIG } from '../config/questions.config';

export interface DifficultyQuestionStats {
  questionCount: number;
  levelNumbers: number[];
}

@Injectable({
  providedIn: 'root',
})
export class QuestionsService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  private getSeenKey(
    category: string,
    difficulty: DifficultyId,
    levelNumber: number,
  ): string {
    return `seen_questions_${category}_${difficulty}_${levelNumber}`;
  }

  private getSeenQuestionIds(
    category: string,
    difficulty: DifficultyId,
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
    difficulty: DifficultyId,
    levelNumber: number,
    questionId: string,
  ) {
    const key = this.getSeenKey(category, difficulty, levelNumber);

    const current = this.getSeenQuestionIds(category, difficulty, levelNumber);

    const updated = [questionId, ...current.filter((id) => id !== questionId)];

    localStorage.setItem(
      key,
      JSON.stringify(updated.slice(0, QUESTIONS_CONFIG.maxSeenQuestions)),
    );
  }

  getDifficultyQuestionStats(
    category: string,
    difficulty: DifficultyId,
  ): Promise<DifficultyQuestionStats> {
    return runInInjectionContext(this.injector, async () => {
      const questionsRef = collection(this.firestore, 'questions');

      const questionsQuery = query(
        questionsRef,
        where('category', '==', category),
        where('difficulty', '==', difficulty),
        where('active', '==', true),
      );

      const snapshot = await getDocs(questionsQuery);

      const levelNumbers = Array.from(
        new Set(
          snapshot.docs
            .map((docSnap) => Number(docSnap.data()['levelNumber']))
            .filter((levelNumber) => Number.isFinite(levelNumber)),
        ),
      ).sort((a, b) => a - b);

      return {
        questionCount: snapshot.size,
        levelNumbers,
      };
    });
  }

  async getDifficultyLevelNumbers(
    category: string,
    difficulty: DifficultyId,
  ): Promise<number[]> {
    const stats = await this.getDifficultyQuestionStats(category, difficulty);

    return stats.levelNumbers;
  }

  getQuestions(
    category: string,
    difficulty: DifficultyId,
    levelNumber: number,
    amount: number = 1,
  ): Promise<QuestionModel[]> {
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
        ...(doc.data() as Omit<QuestionModel, 'id'>),
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

  getRandomActiveQuestions(
    amount: number,
    difficulty?: DifficultyId,
  ): Promise<QuestionModel[]> {
    return runInInjectionContext(this.injector, async () => {
      const questionsRef = collection(this.firestore, 'questions');
      const questionsQuery = query(
        questionsRef,
        where('active', '==', true),
        ...(difficulty ? [where('difficulty', '==', difficulty)] : []),
      );
      const snapshot = await getDocs(questionsQuery);
      const questions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<QuestionModel, 'id'>),
      }));

      return questions.sort(() => Math.random() - 0.5).slice(0, amount);
    });
  }
}
