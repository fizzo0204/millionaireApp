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
  explanation: string;
  active: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class QuestionsService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

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
        limit(amount),
      );

      const snapshot = await getDocs(questionsQuery);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<QuizQuestion, 'id'>),
      }));
    });
  }
}
