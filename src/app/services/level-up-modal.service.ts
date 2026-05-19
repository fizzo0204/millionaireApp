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

  getCurrentState(): LevelUpModalState {
    return this.stateSubject.value;
  }

  show(
    uid: string,
    level: number,
    previousLevel: number | null = null,
    coinsReward: number = 0,
  ) {
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
  }
}
