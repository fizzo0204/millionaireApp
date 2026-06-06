import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { BehaviorSubject, Subscription, firstValueFrom } from 'rxjs';
import {
  Firestore,
  doc,
  docData,
  runTransaction,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { AppUserProfile } from '../models/user-stats.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

@Injectable({
  providedIn: 'root',
})
export class CoinsService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private auth = inject(AuthService);

  private userSub?: Subscription;
  private coinsSub?: Subscription;

  private coinsSubject = new BehaviorSubject<number>(0);
  coins$ = this.coinsSubject.asObservable();

  constructor() {
    this.listenToUserCoins();
  }

  private listenToUserCoins() {
    this.userSub = this.auth.user$.subscribe((user) => {
      this.coinsSub?.unsubscribe();

      if (!user) {
        this.coinsSubject.next(0);
        return;
      }

      // L'utente anonimo e un ospite giocabile: leggiamo le sue monete da Firestore.
      const userRef = doc(this.firestore, `users/${user.uid}`);

      this.coinsSub = this.runFirestore(() => docData(userRef)).subscribe((profile) => {
        const userProfile = profile as AppUserProfile | undefined;
        const coins =
          userProfile?.stats?.coins ?? USER_STATS_CONFIG.defaultCoins;
        this.coinsSubject.next(coins);
      });
    });
  }

  // Restituisce il valore locale piu recente mostrato dalla UI.
  getCoins(): number {
    return this.coinsSubject.value;
  }

  // Aggiunge monete al profilo corrente, incluso l'ospite anonimo.
  async addCoins(amount: number) {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await this.runFirestore(() => runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return;

      const stats = snapshot.data()['stats'] ?? {};
      const currentCoins =
        typeof stats?.coins === 'number'
          ? stats.coins
          : USER_STATS_CONFIG.defaultCoins;

      transaction.update(userRef, {
        'stats.coins': currentCoins + amount,
      });
    }));
  }

  // Controlla se può spendere
  canAfford(amount: number): boolean {
    return this.getCoins() >= amount;
  }

  // Spendi monete
  async spendCoins(amount: number): Promise<boolean> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return false;

    if (!this.canAfford(amount)) return false;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    const spent = await this.runFirestore(() => runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return false;

      const stats = snapshot.data()['stats'] ?? {};
      const currentCoins =
        typeof stats?.coins === 'number'
          ? stats.coins
          : USER_STATS_CONFIG.defaultCoins;

      if (currentCoins < amount) return false;

      transaction.update(userRef, {
        'stats.coins': currentCoins - amount,
      });

      return true;
    }));

    return spent;
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
