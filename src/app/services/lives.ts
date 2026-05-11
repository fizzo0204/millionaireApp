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

@Injectable({
  providedIn: 'root',
})
export class LivesService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  private userSub?: Subscription;
  private livesDocSub?: Subscription;

  private readonly MAX_LIVES = 5;
  // private readonly RECOVERY_TIME = 30 * 60 * 1000; // 30 minuti
  private readonly RECOVERY_TIME = 15000;

  private livesSubject = new BehaviorSubject<number>(this.MAX_LIVES);
  lives$ = this.livesSubject.asObservable();

  private countdownSubject = new BehaviorSubject<string>('');
  countdown$ = this.countdownSubject.asObservable();

  private timerSub?: Subscription;

  constructor() {
    this.listenToUserLives();
    this.startCountdown();
  }

  private listenToUserLives() {
    this.userSub = this.auth.user$.subscribe((user) => {
      this.livesDocSub?.unsubscribe();

      if (!user || user.isAnonymous) {
        this.livesSubject.next(this.MAX_LIVES);
        this.countdownSubject.next('');
        return;
      }

      const userRef = doc(this.firestore, `users/${user.uid}`);

      this.livesDocSub = docData(userRef).subscribe((profile: any) => {
        const lives = profile?.stats?.lives ?? this.MAX_LIVES;

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
      'stats.lives': increment(-1),
      'stats.lastLifeUpdate': serverTimestamp(),
    });

    return true;
  }

  async addLife(amount: number = 1) {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) return;

    const currentLives = this.getLives();
    const updatedLives = Math.min(this.MAX_LIVES, currentLives + amount);

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await updateDoc(userRef, {
      'stats.lives': updatedLives,
      'stats.lastLifeUpdate':
        updatedLives >= this.MAX_LIVES ? null : serverTimestamp(),
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

    if (lives >= this.MAX_LIVES) {
      this.countdownSubject.next('');
      return;
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    const profile: any = await firstValueFrom(docData(userRef));

    const lastLifeUpdate = profile?.stats?.lastLifeUpdate;

    if (!lastLifeUpdate?.toDate) return;

    const lastUpdateTime = lastLifeUpdate.toDate().getTime();
    const now = Date.now();

    const diff = now - lastUpdateTime;
    const recoveredLives = Math.floor(diff / this.RECOVERY_TIME);

    if (recoveredLives <= 0) return;

    const updatedLives = Math.min(this.MAX_LIVES, lives + recoveredLives);

    const newLastUpdate =
      updatedLives >= this.MAX_LIVES
        ? null
        : new Date(lastUpdateTime + recoveredLives * this.RECOVERY_TIME);

    await updateDoc(userRef, {
      'stats.lives': updatedLives,
      'stats.lastLifeUpdate': newLastUpdate,
    });
  }

  private async updateCountdown() {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) {
      this.countdownSubject.next('');
      return;
    }

    const lives = this.getLives();

    if (lives >= this.MAX_LIVES) {
      this.countdownSubject.next('');
      return;
    }

    const userRef = doc(this.firestore, `users/${user.uid}`);
    const profile: any = await firstValueFrom(docData(userRef));

    const lastLifeUpdate = profile?.stats?.lastLifeUpdate;

    if (!lastLifeUpdate?.toDate) {
      this.countdownSubject.next('');
      return;
    }

    const lastUpdateTime = lastLifeUpdate.toDate().getTime();
    const nextLifeAt = lastUpdateTime + this.RECOVERY_TIME;
    const remaining = Math.max(0, nextLifeAt - Date.now());

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.countdownSubject.next(formatted);
  }
}
