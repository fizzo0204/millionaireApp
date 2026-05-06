import { Injectable } from '@angular/core';
import * as localforage from 'localforage';

export type DifficultyId = 'easy' | 'medium' | 'hard' | 'extreme';

@Injectable({
  providedIn: 'root',
})
export class ProgressService {
  private readonly STORAGE_KEY = 'difficulty_progress';

  private readonly difficultyOrder: DifficultyId[] = [
    'easy',
    'medium',
    'hard',
    'extreme',
  ];

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
