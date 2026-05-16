import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
} from '@angular/fire/firestore';
import { DifficultyId } from '../models/difficulty.model';
import {
  UserCategoryProgress,
  CompletedLevelProgress,
} from 'src/app/models/progress.model';

@Injectable({
  providedIn: 'root',
})
export class ProgressService {
  private firestore = inject(Firestore);

  private getUserCategoryProgressRef(uid: string, categoryId: string) {
    return doc(this.firestore, `users/${uid}/progress/${categoryId}`);
  }

  getLevelId(
    categoryId: string,
    difficultyId: DifficultyId,
    levelNumber: number,
  ): string {
    return `${categoryId}_${difficultyId}_${levelNumber}`;
  }

  private getCompletedLevelRef(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    levelNumber: number,
  ) {
    const levelId = this.getLevelId(categoryId, difficultyId, levelNumber);

    return doc(this.firestore, `users/${uid}/completedLevels/${levelId}`);
  }

  async isLevelCompleted(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    levelNumber: number,
  ): Promise<boolean> {
    const levelRef = this.getCompletedLevelRef(
      uid,
      categoryId,
      difficultyId,
      levelNumber,
    );

    const snapshot = await getDoc(levelRef);

    return snapshot.exists();
  }

  async completeLevel(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    levelNumber: number,
  ): Promise<void> {
    const levelRef = this.getCompletedLevelRef(
      uid,
      categoryId,
      difficultyId,
      levelNumber,
    );

    await setDoc(
      levelRef,
      {
        categoryId,
        difficultyId,
        levelNumber,
        completedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  getDifficultyLevels(difficultyId: DifficultyId): number[] {
    if (difficultyId === 'easy') {
      return Array.from({ length: 30 }, (_, i) => i + 1);
    }

    if (difficultyId === 'medium') {
      return Array.from({ length: 30 }, (_, i) => i + 31);
    }

    if (difficultyId === 'hard') {
      return Array.from({ length: 40 }, (_, i) => i + 61);
    }

    return Array.from({ length: 50 }, (_, i) => i + 101);
  }

  async isDifficultyFullyCompleted(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
  ): Promise<boolean> {
    const levels = this.getDifficultyLevels(difficultyId);

    for (const levelNumber of levels) {
      const completed = await this.isLevelCompleted(
        uid,
        categoryId,
        difficultyId,
        levelNumber,
      );

      if (!completed) return false;
    }

    return true;
  }

  async getUserCategoryProgress(
    uid: string,
    categoryId: string,
  ): Promise<UserCategoryProgress> {
    const progressRef = this.getUserCategoryProgressRef(uid, categoryId);
    const snapshot = await getDoc(progressRef);

    if (!snapshot.exists()) {
      return {
        completedDifficulties: [],
      };
    }

    return snapshot.data() as UserCategoryProgress;
  }

  async completeUserDifficulty(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
  ): Promise<void> {
    const currentProgress = await this.getUserCategoryProgress(uid, categoryId);

    const completedDifficulties = Array.from(
      new Set([...currentProgress.completedDifficulties, difficultyId]),
    );

    const progressRef = this.getUserCategoryProgressRef(uid, categoryId);

    await setDoc(
      progressRef,
      {
        completedDifficulties,
      },
      { merge: true },
    );
  }

  isDifficultyUnlockedFromProgress(
    difficultyId: DifficultyId,
    completedDifficulties: DifficultyId[],
  ): boolean {
    if (difficultyId === 'easy') return true;

    const order: DifficultyId[] = ['easy', 'medium', 'hard', 'extreme'];
    const currentIndex = order.indexOf(difficultyId);
    const previousDifficulty = order[currentIndex - 1];

    if (!previousDifficulty) return true;

    return completedDifficulties.includes(previousDifficulty);
  }

  async getCompletedLevelNumbers(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
  ): Promise<number[]> {
    const levelsRef = collection(
      this.firestore,
      `users/${uid}/completedLevels`,
    );
    const snapshot = await getDocs(levelsRef);

    return snapshot.docs
      .map((docSnap) => docSnap.data() as CompletedLevelProgress)
      .filter(
        (data) =>
          data.categoryId === categoryId && data.difficultyId === difficultyId,
      )
      .map((data) => data.levelNumber as number);
  }
}
