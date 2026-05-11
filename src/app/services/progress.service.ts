import { Injectable, inject } from '@angular/core';
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
}
