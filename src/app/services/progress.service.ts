import { Injectable, inject } from '@angular/core';
import * as localforage from 'localforage';
import { Firestore } from '@angular/fire/firestore';
import { doc, getDoc, setDoc } from '@angular/fire/firestore';

export type DifficultyId = 'easy' | 'medium' | 'hard' | 'extreme';

export interface UserCategoryProgress {
  completedDifficulties: DifficultyId[];
}

@Injectable({
  providedIn: 'root',
})
export class ProgressService {
  private firestore = inject(Firestore);

  private readonly STORAGE_KEY = 'difficulty_progress';

  private readonly difficultyOrder: DifficultyId[] = [
    'easy',
    'medium',
    'hard',
    'extreme',
  ];

  private getUserCategoryProgressRef(uid: string, categoryId: string) {
    return doc(this.firestore, `users/${uid}/progress/${categoryId}`);
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

  async isDifficultyCompleted(
    categoryId: string,
    difficultyId: DifficultyId,
  ): Promise<boolean> {
    const progress = await this.getProgress();
    return !!progress[this.getKey(categoryId, difficultyId)];
  }

  async completeDifficulty(
    categoryId: string,
    difficultyId: DifficultyId,
  ): Promise<void> {
    const progress = await this.getProgress();
    progress[this.getKey(categoryId, difficultyId)] = true;

    await localforage.setItem(this.STORAGE_KEY, progress);
  }

  async isDifficultyUnlocked(
    categoryId: string,
    difficultyId: DifficultyId,
  ): Promise<boolean> {
    if (difficultyId === 'easy') return true;

    const currentIndex = this.difficultyOrder.indexOf(difficultyId);
    const previousDifficulty = this.difficultyOrder[currentIndex - 1];

    if (!previousDifficulty) return true;

    return this.isDifficultyCompleted(categoryId, previousDifficulty);
  }

  private async getProgress(): Promise<Record<string, boolean>> {
    return (
      (await localforage.getItem<Record<string, boolean>>(this.STORAGE_KEY)) ||
      {}
    );
  }

  private getKey(categoryId: string, difficultyId: DifficultyId): string {
    return `${categoryId}_${difficultyId}`;
  }

  //TEST
  async resetProgress(): Promise<void> {
    await localforage.removeItem(this.STORAGE_KEY);
  }
}
