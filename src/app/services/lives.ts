import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { BehaviorSubject, interval, Subscription, firstValueFrom } from 'rxjs';
import {
  Firestore,
  doc,
  docData,
  updateDoc,
  serverTimestamp,
  UpdateData,
  DocumentData,
  runTransaction,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { LIVES_CONFIG } from 'src/app/config/lives.config';
import { AppUserProfile } from '../models/user-stats.model';

@Injectable({
  providedIn: 'root',
})
export class LivesService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private auth = inject(AuthService);

  private userSub?: Subscription;
  private livesDocSub?: Subscription;
  private timerSub?: Subscription;

  private livesSubject = new BehaviorSubject<number>(LIVES_CONFIG.maxLives);
  private countdownSubject = new BehaviorSubject<string>('');
  private lastLifeUpdateTime: number | null = null;
  private isRecoveringLives = false;

  lives$ = this.livesSubject.asObservable();
  countdown$ = this.countdownSubject.asObservable();

  constructor() {
    this.listenToUserLives();
    this.startCountdown();
  }

  private listenToUserLives() {
    this.userSub = this.auth.user$.subscribe((user) => {
      this.livesDocSub?.unsubscribe();

      if (!user) {
        this.livesSubject.next(LIVES_CONFIG.maxLives);
        this.countdownSubject.next('');
        this.lastLifeUpdateTime = null;
        return;
      }

      // L'ospite anonimo usa lo stesso documento Firestore degli account collegati.
      const userRef = doc(this.firestore, `users/${user.uid}`);

      this.livesDocSub = this.runFirestore(() => docData(userRef)).subscribe((profile) => {
        const userProfile = profile as AppUserProfile | undefined;
        const lives = userProfile?.stats?.lives ?? LIVES_CONFIG.maxLives;
        // lastLifeUpdateTime va aggiornato PRIMA di livesSubject.next(): chi si
        // sottoscrive a lives$ (es. NotificationsService) reagisce in modo
        // sincrono dentro next(), e deve gia' vedere il valore aggiornato.
        this.lastLifeUpdateTime = this.getLastLifeUpdateTime(
          userProfile?.stats?.lastLifeUpdate,
        );
        this.livesSubject.next(lives);
      });
    });
  }

  getLives(): number {
    return this.livesSubject.value;
  }

  // Data in cui tutte le vite saranno recuperate, o null se sono gia' piene.
  getFullRecoveryDate(): Date | null {
    const lives = this.getLives();

    if (lives >= LIVES_CONFIG.maxLives) return null;
    if (!this.lastLifeUpdateTime) return null;

    const livesNeeded = LIVES_CONFIG.maxLives - lives;

    return new Date(
      this.lastLifeUpdateTime + livesNeeded * LIVES_CONFIG.recoveryTime,
    );
  }

  async spendLife(): Promise<boolean> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return false;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    return this.runFirestore(() => runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return false;

      const profile = snapshot.data() as AppUserProfile;
      const currentLives = profile.stats?.lives ?? LIVES_CONFIG.maxLives;

      if (currentLives <= 0) return false;

      const lastLifeUpdateTime = this.getLastLifeUpdateTime(
        profile.stats?.lastLifeUpdate,
      );

      const updates: UpdateData<DocumentData> = {
        [LIVES_CONFIG.firestorePaths.lives]: currentLives - 1,
      };

      if (currentLives >= LIVES_CONFIG.maxLives || !lastLifeUpdateTime) {
        updates[LIVES_CONFIG.firestorePaths.lastLifeUpdate] = serverTimestamp();
      }

      transaction.update(userRef, updates);
      return true;
    }));
  }

  async addLife(amount: number = 1): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    /*
     * Transazionale come spendLife(), non piu' un updateDoc "cieco" basato
     * su this.getLives() (valore cache locale dello stream lives$): una
     * spendLife()/recoverLivesIfNeeded() concorrente che committa tra la
     * lettura della cache e questo updateDoc veniva silenziosamente
     * sovrascritta/persa. Leggiamo lo stato fresco dentro la transazione,
     * stessa fonte di verita' usata da spendLife().
     */
    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return;

        const profile = snapshot.data() as AppUserProfile;
        const currentLives = profile.stats?.lives ?? LIVES_CONFIG.maxLives;
        const updatedLives = Math.min(
          LIVES_CONFIG.maxLives,
          currentLives + amount,
        );

        const updates: UpdateData<DocumentData> = {
          [LIVES_CONFIG.firestorePaths.lives]: updatedLives,
        };

        if (updatedLives >= LIVES_CONFIG.maxLives) {
          updates[LIVES_CONFIG.firestorePaths.lastLifeUpdate] = null;
        } else {
          const lastLifeUpdateTime = this.getLastLifeUpdateTime(
            profile.stats?.lastLifeUpdate,
          );

          if (!lastLifeUpdateTime) {
            updates[LIVES_CONFIG.firestorePaths.lastLifeUpdate] =
              serverTimestamp();
          }
        }

        transaction.update(userRef, updates);
      }),
    );
  }

  private startCountdown() {
    this.timerSub?.unsubscribe();

    this.timerSub = interval(1000).subscribe(async () => {
      await this.recoverLivesIfNeeded();
      await this.updateCountdown();
    });
  }

  private async recoverLivesIfNeeded() {
    if (this.isRecoveringLives) return;

    this.isRecoveringLives = true;

    try {
      const user = await firstValueFrom(this.auth.user$);

      if (!user) return;

      const lives = this.getLives();

      if (lives >= LIVES_CONFIG.maxLives) {
        this.countdownSubject.next('');
        return;
      }

      const userRef = doc(this.firestore, `users/${user.uid}`);
      const lastUpdateTime = this.lastLifeUpdateTime;

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
          : new Date(
              lastUpdateTime + recoveredLives * LIVES_CONFIG.recoveryTime,
            );

      await this.runFirestore(() => updateDoc(userRef, {
        [LIVES_CONFIG.firestorePaths.lives]: updatedLives,
        [LIVES_CONFIG.firestorePaths.lastLifeUpdate]: newLastUpdate,
      }));
    } finally {
      this.isRecoveringLives = false;
    }
  }

  private async updateCountdown() {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      this.countdownSubject.next('');
      return;
    }

    const lives = this.getLives();

    if (lives >= LIVES_CONFIG.maxLives) {
      this.countdownSubject.next('');
      return;
    }

    const lastUpdateTime = this.lastLifeUpdateTime;

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

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
