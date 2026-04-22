import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as localforage from 'localforage';

@Injectable({
  providedIn: 'root',
})
export class CoinsService {
  private readonly STORAGE_KEY = 'coins';

  private coinsSubject = new BehaviorSubject<number>(0);
  coins$ = this.coinsSubject.asObservable();

  constructor() {
    this.init();
  }

  // Inizializza le monete
  private async init() {
    const storedCoins = await localforage.getItem<number>(this.STORAGE_KEY);

    if (storedCoins === null) {
      // primo avvio → diamo monete iniziali
      const initialCoins = 20;
      await localforage.setItem(this.STORAGE_KEY, initialCoins);
      this.coinsSubject.next(initialCoins);
    } else {
      this.coinsSubject.next(storedCoins);
    }
  }

  // Ottieni valore corrente
  getCoins(): number {
    return this.coinsSubject.value;
  }

  // Aggiungi monete
  async addCoins(amount: number) {
    const newAmount = this.getCoins() + amount;
    await localforage.setItem(this.STORAGE_KEY, newAmount);
    this.coinsSubject.next(newAmount);
  }

  // Controlla se può spendere
  canAfford(amount: number): boolean {
    return this.getCoins() >= amount;
  }

  // Spendi monete
  async spendCoins(amount: number): Promise<boolean> {
    if (!this.canAfford(amount)) return false;

    const newAmount = this.getCoins() - amount;
    await localforage.setItem(this.STORAGE_KEY, newAmount);
    this.coinsSubject.next(newAmount);

    return true;
  }

  // Reset (utile per debug)
  async resetCoins() {
    await localforage.setItem(this.STORAGE_KEY, 20);
    this.coinsSubject.next(20);
  }
}
