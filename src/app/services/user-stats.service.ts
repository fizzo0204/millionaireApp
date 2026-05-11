import { Injectable, inject } from '@angular/core';
import { docData, Firestore } from '@angular/fire/firestore';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { increment } from '@angular/fire/firestore';
import { User } from 'firebase/auth';
import { Observable } from 'rxjs';
import { runTransaction } from '@angular/fire/firestore';

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
}
