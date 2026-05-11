import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subscription, firstValueFrom } from 'rxjs';
import {
  Firestore,
  doc,
  docData,
  updateDoc,
  increment,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class CoinsService {
  private firestore = inject(Firestore);
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

      if (!user || user.isAnonymous) {
        this.coinsSubject.next(0);
        return;
      }

      const userRef = doc(this.firestore, `users/${user.uid}`);

      this.coinsSub = docData(userRef).subscribe((profile: any) => {
        const coins = profile?.stats?.coins ?? 20;
        this.coinsSubject.next(coins);
      });
    });
  }

  // Ottieni valore corrente
  getCoins(): number {
    return this.coinsSubject.value;
  }

  // Aggiungi monete
  async addCoins(amount: number) {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) return;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await updateDoc(userRef, {
      'stats.coins': increment(amount),
    });
  }

  // Controlla se può spendere
  canAfford(amount: number): boolean {
    return this.getCoins() >= amount;
  }

  // Spendi monete
  async spendCoins(amount: number): Promise<boolean> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) return false;

    if (!this.canAfford(amount)) return false;

    const userRef = doc(this.firestore, `users/${user.uid}`);

    await updateDoc(userRef, {
      'stats.coins': increment(-amount),
    });

    return true;
  }
}
