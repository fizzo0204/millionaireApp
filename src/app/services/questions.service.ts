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
import { ARCADE_CONFIG } from 'src/app/config/arcade.config';

export interface DifficultyQuestionStats {
  questionCount: number;
  levelNumbers: number[];
}

export interface ArcadeLevelTarget {
  arcadeLevel: number;
  difficultyId: DifficultyId;
  levelNumber: number;
  totalLevels: number;
}

export interface ArcadeQuestionSelection extends ArcadeLevelTarget {
  question: QuestionModel;
}

@Injectable({
  providedIn: 'root',
})
export class QuestionsService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private arcadePlanCache:
    | {
        createdAt: number;
        targets: ArcadeLevelTarget[];
      }
    | undefined;
  private readonly arcadePlanCacheMs = 60_000;

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

  async getArcadeQuestionForLevel(
    arcadeLevel: number,
  ): Promise<ArcadeQuestionSelection | null> {
    /*
     * Arcade non segue una categoria: prende il livello progressivo globale,
     * lo traduce in difficolta + levelNumber reale e poi pesca una variante
     * casuale tra tutte le categorie disponibili per quel livello.
     */
    const target = await this.getArcadeLevelTarget(arcadeLevel);

    if (!target) return null;

    const questions = await this.getArcadeQuestionsForTarget(target);

    if (questions.length === 0) return null;

    return {
      ...target,
      question: questions[0],
    };
  }

  async getArcadeTotalLevels(): Promise<number> {
    const targets = await this.getArcadeLevelTargets();

    return targets.length;
  }

  private async getArcadeLevelTarget(
    arcadeLevel: number,
  ): Promise<ArcadeLevelTarget | null> {
    const safeArcadeLevel = Math.max(1, Math.floor(arcadeLevel));
    const targets = await this.getArcadeLevelTargets();

    return targets[safeArcadeLevel - 1] ?? null;
  }

  private async getArcadeLevelTargets(): Promise<ArcadeLevelTarget[]> {
    const now = Date.now();

    if (
      this.arcadePlanCache &&
      now - this.arcadePlanCache.createdAt < this.arcadePlanCacheMs
    ) {
      return this.arcadePlanCache.targets;
    }

    const targets = await runInInjectionContext(this.injector, async () => {
      const questionsRef = collection(this.firestore, 'questions');
      const collectedTargets: Omit<ArcadeLevelTarget, 'totalLevels'>[] = [];

      for (const difficultyId of ARCADE_CONFIG.difficultyOrder) {
        const questionsQuery = query(
          questionsRef,
          where('difficulty', '==', difficultyId),
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

        for (const levelNumber of levelNumbers) {
          collectedTargets.push({
            arcadeLevel: collectedTargets.length + 1,
            difficultyId,
            levelNumber,
          });
        }
      }

      return collectedTargets.map((target) => ({
        ...target,
        totalLevels: collectedTargets.length,
      }));
    });

    this.arcadePlanCache = {
      createdAt: now,
      targets,
    };

    return targets;
  }

  private async getArcadeQuestionsForTarget(
    target: ArcadeLevelTarget,
  ): Promise<QuestionModel[]> {
    return runInInjectionContext(this.injector, async () => {
      const questionsRef = collection(this.firestore, 'questions');
      const questionsQuery = query(
        questionsRef,
        where('difficulty', '==', target.difficultyId),
        where('levelNumber', '==', target.levelNumber),
        where('active', '==', true),
      );

      const snapshot = await getDocs(questionsQuery);
      const questions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<QuestionModel, 'id'>),
      }));

      const seenIds = this.getSeenQuestionIds(
        'arcade',
        target.difficultyId,
        target.levelNumber,
      );

      let availableQuestions = questions.filter(
        (question) => question.id && !seenIds.includes(question.id),
      );

      if (availableQuestions.length === 0) {
        availableQuestions = questions;
      }

      const selectedQuestions = availableQuestions
        .sort(() => Math.random() - 0.5)
        .slice(0, 1);

      for (const question of selectedQuestions) {
        if (question.id) {
          this.saveSeenQuestionId(
            'arcade',
            target.difficultyId,
            target.levelNumber,
            question.id,
          );
        }
      }

      return selectedQuestions;
    });
  }
}
