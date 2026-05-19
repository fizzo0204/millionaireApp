import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { LevelUpModalService } from '../../services/level-up-modal.service';
import { AdsService } from 'src/app/services/ads.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

@Component({
  selector: 'app-level-up-modal',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './level-up-modal.component.html',
  styleUrls: ['./level-up-modal.component.scss'],
})
export class LevelUpModalComponent {
  readonly state$ = this.levelUpModal.state$;

  constructor(
    private levelUpModal: LevelUpModalService,
    private ads: AdsService,
    private userStatsService: UserStatsService,
  ) {}

  async watchAdAndDoubleReward() {
    const state = this.levelUpModal.getCurrentState();

    if (
      state.doubleLoading ||
      state.claimLoading ||
      state.rewardDoubled ||
      state.coinsReward <= 0
    ) {
      return;
    }

    this.levelUpModal.setDoubleLoading(true);

    try {
      const rewarded = await this.ads.showRewardedAd();

      if (!rewarded) return;

      this.levelUpModal.markRewardDoubled();
    } finally {
      this.levelUpModal.setDoubleLoading(false);
    }
  }

  async continue() {
    const state = this.levelUpModal.getCurrentState();

    if (state.doubleLoading || state.claimLoading) return;

    if (
      !state.uid ||
      state.previousLevel === null ||
      state.level === null ||
      state.coinsReward <= 0
    ) {
      this.levelUpModal.close();
      return;
    }

    this.levelUpModal.setClaimLoading(true);

    try {
      await this.userStatsService.claimLevelUpCoinsReward(
        state.uid,
        state.previousLevel,
        state.level,
        state.coinsReward,
      );

      this.levelUpModal.close();
    } catch (error) {
      console.warn('Errore claim premio level up:', error);
    } finally {
      this.levelUpModal.setClaimLoading(false);
    }
  }
}
