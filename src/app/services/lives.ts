import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, interval, Subscription, firstValueFrom } from 'rxjs';
import {
  Firestore,
  doc,
  docData,
  updateDoc,
  serverTimestamp,
  increment,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { LIVES_CONFIG } from 'src/app/config/lives.config';
import { AppUserProfile } from '../models/user-stats.model';

@Injectable({
  providedIn: 'root',
})
export class LivesService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  private userSub?: Subscription;
  private livesDocSub?: Subscription;
  private timerSub?: Subscription;

  private livesSubject = new BehaviorSubject<number>(LIVES_CONFIG.maxLives);
  private countdownSubject = new BehaviorSubject<string>('');

  lives$ = this.livesSubject.asObservable();
  countdown$ = this.countdownSubject.asObservable();

  constructor() {
    this.listenToUserLives();
    this.startCountdown();
  }

  private listenToUserLives() {
    this.userSub = this.auth.user$.subscribe((user) => {
      this.livesDocSub?.unsubscribe();

      if (!user || user.isAnonymous) {
        this.livesSubject.next(LIVES_CONFIG.maxLives);
        this.countdownSubject.next('');
        return;
      }

      const userRef = doc(this.firestore, `users/${user.uid}`);

      this.livesDocSub = docData(userRef).subscribe((profile) => {
        const userProfile = profile as AppUserProfile | undefined;
        const lives = userProfile?.stats?.lives ?? LIVES_CONFIG.maxLives;
        this.livesSubject.next(lives);
      });
    });
  }

  getLives(): number {
    return this.livesSubject.value;
  }

  async spendLife(): Promise<boolean> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) return false;

    const currentLives = this.getLives();

    if (currentLives <= 0) return false;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await updateDoc(userRef, {
      [LIVES_CONFIG.firestorePaths.lives]: increment(-1),
      [LIVES_CONFIG.firestorePaths.lastLifeUpdate]: serverTimestamp(),
    });

    return true;
  }

  async addLife(amount: number = 1) {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) return;

    const currentLives = this.getLives();
    const updatedLives = Math.min(LIVES_CONFIG.maxLives, currentLives + amount);

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await updateDoc(userRef, {
      [LIVES_CONFIG.firestorePaths.lives]: updatedLives,
      [LIVES_CONFIG.firestorePaths.lastLifeUpdate]:
        updatedLives >= LIVES_CONFIG.maxLives ? null : serverTimestamp(),
    });
  }

  private startCountdown() {
    this.timerSub?.unsubscribe();

    this.timerSub = interval(1000).subscribe(async () => {
      await this.recoverLivesIfNeeded();
      await this.updateCountdown();
    });
  }

  private async recoverLivesIfNeeded() {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) return;

    const lives = this.getLives();

    if (lives >= LIVES_CONFIG.maxLives) {
      this.countdownSubject.next('');
      return;
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    const profile = (await firstValueFrom(docData(userRef))) as
      | AppUserProfile
      | undefined;

    const lastUpdateTime = this.getLastLifeUpdateTime(
      profile?.stats?.lastLifeUpdate,
    );

    if (!lastUpdateTime) return;
    const now = Date.now();

    const diff = now - lastUpdateTime;
    const recoveredLives = Math.floor(diff / LIVES_CONFIG.recoveryTime);

    if (recoveredLives <= 0) return;

    const updatedLives = Math.min(
      LIVES_CONFIG.maxLives,
      lives + recoveredLives,
    );

    const newLastUpdate =
      updatedLives >= LIVES_CONFIG.maxLives
        ? null
        : new Date(lastUpdateTime + recoveredLives * LIVES_CONFIG.recoveryTime);

    await updateDoc(userRef, {
      [LIVES_CONFIG.firestorePaths.lives]: updatedLives,
      [LIVES_CONFIG.firestorePaths.lastLifeUpdate]: newLastUpdate,
    });
  }

  private async updateCountdown() {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) {
      this.countdownSubject.next('');
      return;
    }

    const lives = this.getLives();

    if (lives >= LIVES_CONFIG.maxLives) {
      this.countdownSubject.next('');
      return;
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    const profile = (await firstValueFrom(docData(userRef))) as
      | AppUserProfile
      | undefined;

    const lastUpdateTime = this.getLastLifeUpdateTime(
      profile?.stats?.lastLifeUpdate,
    );

    if (!lastUpdateTime) {
      this.countdownSubject.next('');
      return;
    }
    const nextLifeAt = lastUpdateTime + LIVES_CONFIG.recoveryTime;
    const remaining = Math.max(0, nextLifeAt - Date.now());

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.countdownSubject.next(formatted);
  }

  private getLastLifeUpdateTime(value: unknown): number | null {
    if (!value) return null;

    if (typeof value === 'number') {
      return value;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (
      typeof value === 'object' &&
      'toDate' in value &&
      typeof value.toDate === 'function'
    ) {
      return value.toDate().getTime();
    }

    return null;
  }
}
