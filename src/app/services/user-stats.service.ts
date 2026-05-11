import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  runTransaction,
  docData,
  collection,
  addDoc,
  collectionData,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
} from '@angular/fire/firestore';
import { User } from 'firebase/auth';
import { Observable } from 'rxjs';

export interface UserStats {
  quizPlayed: number;
  correctAnswers: number;
  wrongAnswers: number;
  bestScore: number;
  streakDays: number;
  xp: number;
  level: number;
  coins: number;
  lives: number;
}

export interface AppUserProfile {
  uid: string;

  displayName: string | null;
  email: string | null;
  photoURL: string | null;

  createdAt: unknown;
  lastLoginAt: unknown;

  stats: UserStats;
}

export interface QuizHistoryItem {
  categoryId: string;
  difficultyId: string;

  correctAnswers: number;
  totalQuestions: number;

  playedAt: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class UserStatsService {
  private firestore = inject(Firestore);

  readonly defaultStats: UserStats = {
    quizPlayed: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    bestScore: 0,
    streakDays: 0,
    xp: 0,
    level: 1,
    coins: 20,
    lives: 5,
  };

  async ensureUserProfile(user: User): Promise<void> {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        stats: this.defaultStats,
      });

      return;
    }

    await updateDoc(userRef, {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      lastLoginAt: serverTimestamp(),
    });
  }

  getUserProfile(uid: string): Observable<AppUserProfile | undefined> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return docData(userRef) as Observable<AppUserProfile | undefined>;
  }

  async recordQuizResult(
    uid: string,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();
      const stats = data['stats'];

      const currentBestScore = stats?.bestScore ?? 0;
      const currentXp = stats?.xp ?? 0;

      const xpEarned = correctAnswers * 10;
      const updatedXp = currentXp + xpEarned;

      const updatedLevel = Math.max(1, Math.floor(updatedXp / 100) + 1);

      transaction.update(userRef, {
        'stats.quizPlayed': increment(1),

        'stats.correctAnswers': increment(correctAnswers),

        'stats.wrongAnswers': increment(totalQuestions - correctAnswers),

        'stats.xp': increment(xpEarned),

        'stats.level': updatedLevel,

        'stats.bestScore': Math.max(currentBestScore, correctAnswers),
      });
    });
  }

  async recordQuizHistory(
    uid: string,
    categoryId: string,
    difficultyId: string,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    await addDoc(historyRef, {
      categoryId,
      difficultyId,
      correctAnswers,
      totalQuestions,
      playedAt: serverTimestamp(),
    });
  }

  getRecentQuizHistory(
    uid: string,
    maxResults: number = 5,
  ): Observable<QuizHistoryItem[]> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    const historyQuery = query(
      historyRef,
      orderBy('playedAt', 'desc'),
      limit(maxResults),
    );

    return collectionData(historyQuery, {
      idField: 'id',
    }) as Observable<QuizHistoryItem[]>;
  }

  // TEST
  async resetUserDebugData(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    const collectionsToClear = ['completedLevels', 'quizHistory', 'progress'];

    for (const collectionName of collectionsToClear) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );

      const snapshot = await getDocs(collectionRef);

      for (const document of snapshot.docs) {
        await deleteDoc(document.ref);
      }
    }

    await updateDoc(userRef, {
      stats: {
        ...this.defaultStats,
        lastLifeUpdate: null,
      },
    });
  }
}
