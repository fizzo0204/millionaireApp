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

interface CacheEntry<T> {
  createdAt: number;
  value: T;
}

@Injectable({
  providedIn: 'root',
})
export class QuestionsService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private difficultyStatsCache = new Map<
    string,
    CacheEntry<DifficultyQuestionStats>
  >();
  private levelQuestionsCache = new Map<string, CacheEntry<QuestionModel[]>>();
  private randomQuestionsCache = new Map<string, CacheEntry<QuestionModel[]>>();
  private arcadeQuestionsCache = new Map<string, CacheEntry<QuestionModel[]>>();
  private arcadePlanCache:
    | {
        createdAt: number;
        targets: ArcadeLevelTarget[];
      }
    | undefined;

  private readonly questionCacheMs = 120_000;
  private readonly randomQuestionCacheMs = 60_000;
  private readonly difficultyStatsCacheMs = 120_000;
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
    const cacheKey = `${category}_${difficulty}`;
    const cached = this.getCachedValue(
      this.difficultyStatsCache,
      cacheKey,
      this.difficultyStatsCacheMs,
    );

    if (cached) {
      return Promise.resolve({
        questionCount: cached.questionCount,
        levelNumbers: [...cached.levelNumbers],
      });
    }

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

      const stats = {
        questionCount: snapshot.size,
        levelNumbers,
      };

      this.setCachedValue(this.difficultyStatsCache, cacheKey, stats);

      return {
        questionCount: stats.questionCount,
        levelNumbers: [...stats.levelNumbers],
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
    const cacheKey = `${category}_${difficulty}_${levelNumber}`;
    const cached = this.getCachedValue(
      this.levelQuestionsCache,
      cacheKey,
      this.questionCacheMs,
    );

    if (cached) {
      return Promise.resolve(
        this.selectQuestions(cached, category, difficulty, levelNumber, amount),
      );
    }

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

      this.setCachedValue(this.levelQuestionsCache, cacheKey, questions);

      return this.selectQuestions(
        questions,
        category,
        difficulty,
        levelNumber,
        amount,
      );
    });
  }

  getRandomActiveQuestions(
    amount: number,
    difficulty?: DifficultyId,
  ): Promise<QuestionModel[]> {
    const cacheKey = difficulty ?? 'all';
    const cached = this.getCachedValue(
      this.randomQuestionsCache,
      cacheKey,
      this.randomQuestionCacheMs,
    );

    if (cached) {
      return Promise.resolve(this.pickRandomQuestions(cached, amount));
    }

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

      this.setCachedValue(this.randomQuestionsCache, cacheKey, questions);

      return this.pickRandomQuestions(questions, amount);
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
    const cacheKey = `${target.difficultyId}_${target.levelNumber}`;
    const cached = this.getCachedValue(
      this.arcadeQuestionsCache,
      cacheKey,
      this.questionCacheMs,
    );

    if (cached) {
      return this.selectQuestions(
        cached,
        'arcade',
        target.difficultyId,
        target.levelNumber,
        1,
      );
    }

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

      this.setCachedValue(this.arcadeQuestionsCache, cacheKey, questions);

      return this.selectQuestions(
        questions,
        'arcade',
        target.difficultyId,
        target.levelNumber,
        1,
      );
    });
  }

  private selectQuestions(
    questions: QuestionModel[],
    category: string,
    difficulty: DifficultyId,
    levelNumber: number,
    amount: number,
  ): QuestionModel[] {
    const seenIds = this.getSeenQuestionIds(category, difficulty, levelNumber);

    let availableQuestions = questions.filter(
      (question) => question.id && !seenIds.includes(question.id),
    );

    if (availableQuestions.length === 0) {
      availableQuestions = questions;
    }

    const selectedQuestions = this.pickRandomQuestions(
      availableQuestions,
      amount,
    );

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
  }

  private pickRandomQuestions(
    questions: QuestionModel[],
    amount: number,
  ): QuestionModel[] {
    return [...questions].sort(() => Math.random() - 0.5).slice(0, amount);
  }

  private getCachedValue<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    maxAgeMs: number,
  ): T | null {
    const cached = cache.get(key);

    if (!cached) return null;

    if (Date.now() - cached.createdAt > maxAgeMs) {
      cache.delete(key);
      return null;
    }

    return cached.value;
  }

  private setCachedValue<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
  ) {
    cache.set(key, {
      createdAt: Date.now(),
      value,
    });
  }
}
