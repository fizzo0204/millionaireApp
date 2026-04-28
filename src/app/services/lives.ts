import { Injectable } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import * as localforage from 'localforage';

@Injectable({
  providedIn: 'root',
})
export class LivesService {
  private readonly STORAGE_KEY = 'lives';
  private readonly STORAGE_TIME_KEY = 'lives_last_update';

  private readonly MAX_LIVES = 5;
  // private readonly RECOVERY_TIME = 30 * 60 * 1000; // 30 minuti
  private readonly RECOVERY_TIME = 5000; // 30 minuti

  private livesSubject = new BehaviorSubject<number>(this.MAX_LIVES);
  lives$ = this.livesSubject.asObservable();

  private countdownSubject = new BehaviorSubject<string>('');
  countdown$ = this.countdownSubject.asObservable();

  private timerSub?: Subscription;

  constructor() {
    this.init();
    this.startCountdown();
  }

  private async init() {
    const storedLives = await localforage.getItem<number>(this.STORAGE_KEY);
    const lastUpdate = await localforage.getItem<number>(this.STORAGE_TIME_KEY);

    let lives = storedLives ?? this.MAX_LIVES;

    if (lastUpdate && lives < this.MAX_LIVES) {
      const now = Date.now();
      const diff = now - lastUpdate;
      const recoveredLives = Math.floor(diff / this.RECOVERY_TIME);

      if (recoveredLives > 0) {
        lives = Math.min(this.MAX_LIVES, lives + recoveredLives);

        if (lives >= this.MAX_LIVES) {
          await localforage.removeItem(this.STORAGE_TIME_KEY);
        } else {
          const newTimestamp = lastUpdate + recoveredLives * this.RECOVERY_TIME;
          await localforage.setItem(this.STORAGE_TIME_KEY, newTimestamp);
        }
      }
    }

    await localforage.setItem(this.STORAGE_KEY, lives);
    this.livesSubject.next(lives);
    await this.updateCountdown();
  }

  getLives(): number {
    return this.livesSubject.value;
  }

  async spendLife(): Promise<boolean> {
    const currentLives = this.getLives();

    if (currentLives <= 0) return false;

    const newLives = currentLives - 1;

    await localforage.setItem(this.STORAGE_KEY, newLives);

    if (currentLives === this.MAX_LIVES) {
      await localforage.setItem(this.STORAGE_TIME_KEY, Date.now());
    }

    this.livesSubject.next(newLives);
    await this.updateCountdown();

    return true;
  }

  async addLife(amount: number = 1) {
    const updated = Math.min(this.MAX_LIVES, this.getLives() + amount);

    await localforage.setItem(this.STORAGE_KEY, updated);

    if (updated >= this.MAX_LIVES) {
      await localforage.removeItem(this.STORAGE_TIME_KEY);
    }

    this.livesSubject.next(updated);
    await this.updateCountdown();
  }

  async resetLives() {
    await localforage.setItem(this.STORAGE_KEY, this.MAX_LIVES);
    await localforage.removeItem(this.STORAGE_TIME_KEY);

    this.livesSubject.next(this.MAX_LIVES);
    this.countdownSubject.next('');
  }

  private startCountdown() {
    this.timerSub?.unsubscribe();

    this.timerSub = interval(1000).subscribe(async () => {
      await this.recoverLivesIfNeeded();
      await this.updateCountdown();
    });
  }

  private async recoverLivesIfNeeded() {
    const lives = this.getLives();

    if (lives >= this.MAX_LIVES) {
      await localforage.removeItem(this.STORAGE_TIME_KEY);
      this.countdownSubject.next('');
      return;
    }

    const lastUpdate = await localforage.getItem<number>(this.STORAGE_TIME_KEY);

    if (!lastUpdate) {
      await localforage.setItem(this.STORAGE_TIME_KEY, Date.now());
      return;
    }

    const now = Date.now();
    const diff = now - lastUpdate;
    const recoveredLives = Math.floor(diff / this.RECOVERY_TIME);

    if (recoveredLives <= 0) return;

    const newLives = Math.min(this.MAX_LIVES, lives + recoveredLives);

    await localforage.setItem(this.STORAGE_KEY, newLives);
    this.livesSubject.next(newLives);

    if (newLives >= this.MAX_LIVES) {
      await localforage.removeItem(this.STORAGE_TIME_KEY);
      this.countdownSubject.next('');
    } else {
      const newTimestamp = lastUpdate + recoveredLives * this.RECOVERY_TIME;
      await localforage.setItem(this.STORAGE_TIME_KEY, newTimestamp);
    }
  }

  private async updateCountdown() {
    const lives = this.getLives();

    if (lives >= this.MAX_LIVES) {
      this.countdownSubject.next('');
      return;
    }

    const lastUpdate = await localforage.getItem<number>(this.STORAGE_TIME_KEY);

    if (!lastUpdate) {
      this.countdownSubject.next('');
      return;
    }

    const now = Date.now();
    const nextLifeAt = lastUpdate + this.RECOVERY_TIME;
    const remaining = Math.max(0, nextLifeAt - now);

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.countdownSubject.next(formatted);
  }
}
