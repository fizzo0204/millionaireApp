import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface LevelUpModalState {
  visible: boolean;
  uid: string | null;
  level: number | null;
  previousLevel: number | null;
  coinsReward: number;
  rewardDoubled: boolean;
  doubleLoading: boolean;
  claimLoading: boolean;
}

interface PendingLevelUp {
  uid: string;
  level: number;
  previousLevel: number | null;
  coinsReward: number;
}

@Injectable({
  providedIn: 'root',
})
export class LevelUpModalService {
  private readonly stateSubject = new BehaviorSubject<LevelUpModalState>({
    visible: false,
    uid: null,
    level: null,
    previousLevel: null,
    coinsReward: 0,
    rewardDoubled: false,
    doubleLoading: false,
    claimLoading: false,
  });

  readonly state$ = this.stateSubject.asObservable();

  // Level-up arrivato mentre l'utente sta ancora guardando il video per
  // raddoppiare (o riscattando) quello mostrato: applicato solo a modale
  // libera, vedi show()/close().
  private pendingLevelUp: PendingLevelUp | null = null;

  getCurrentState(): LevelUpModalState {
    return this.stateSubject.value;
  }

  show(
    uid: string,
    level: number,
    previousLevel: number | null = null,
    coinsReward: number = 0,
  ) {
    const current = this.stateSubject.value;

    /*
     * Se un secondo level-up scatta mentre l'utente sta ancora guardando il
     * video per raddoppiare il premio del primo (o mentre lo sta
     * riscattando), sovrascrivere subito lo stato clobbererebbe quell'azione
     * in corso: al ritorno del video, markRewardDoubled()/il claim
     * agirebbero sul livello SBAGLIATO (quello appena arrivato, non quello
     * che l'utente stava davvero guardando). Accodiamo invece questo
     * level-up e lo mostriamo appena il primo si libera, vedi close().
     */
    if (current.visible && (current.doubleLoading || current.claimLoading)) {
      this.pendingLevelUp = { uid, level, previousLevel, coinsReward };
      return;
    }

    this.pendingLevelUp = null;

    this.stateSubject.next({
      visible: true,
      uid,
      level,
      previousLevel,
      coinsReward,
      rewardDoubled: false,
      doubleLoading: false,
      claimLoading: false,
    });
  }

  setDoubleLoading(doubleLoading: boolean) {
    const current = this.stateSubject.value;

    this.stateSubject.next({
      ...current,
      doubleLoading,
    });
  }

  setClaimLoading(claimLoading: boolean) {
    const current = this.stateSubject.value;

    this.stateSubject.next({
      ...current,
      claimLoading,
    });
  }

  markRewardDoubled() {
    const current = this.stateSubject.value;

    this.stateSubject.next({
      ...current,
      coinsReward: current.coinsReward * 2,
      rewardDoubled: true,
      doubleLoading: false,
    });
  }

  close() {
    const current = this.stateSubject.value;

    this.stateSubject.next({
      ...current,
      visible: false,
    });

    this.applyPendingLevelUpIfAny();
  }

  private applyPendingLevelUpIfAny(): void {
    if (!this.pendingLevelUp) return;

    const pending = this.pendingLevelUp;
    this.pendingLevelUp = null;

    this.show(
      pending.uid,
      pending.level,
      pending.previousLevel,
      pending.coinsReward,
    );
  }
}
