import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { AdsService } from 'src/app/services/ads.service';

import {
  DailyChestReward,
  DailyReward,
  DailyRewardClaimPayload,
  CinematicPhase,
  RevealType,
} from 'src/app/models/daily-reward.model';
import { AvatarModel } from 'src/app/models/avatar.model';

interface PreparedDailyRewardClaim {
  payload: DailyRewardClaimPayload;
  revealIcon: string;
  revealLabel: string;
  revealType: RevealType;
  chestReward?: DailyChestReward;
  unlockedAvatar?: AvatarModel;
  epicAvatarReward?: AvatarModel;
}

@Component({
  selector: 'app-daily-reward-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-reward-modal.component.html',
  styleUrls: ['./daily-reward-modal.component.scss'],
})
export class DailyRewardModalComponent {
  claimedNow = false;
  claimLoading = false;
  doubleRewardLoading = false;
  doubleRewardClaimed = false;
  cinematicVisible = false;

  unlockedAvatar: AvatarModel | null = null;
  chestReward: DailyChestReward | null = null;
  epicAvatarReward: AvatarModel | null = null;

  cinematicPhase: CinematicPhase = 'opening';
  rewardRevealType: RevealType = 'coins';

  rewardRevealLabel = '';
  rewardRevealIcon = '';

  private doubleRewardPayload: DailyRewardClaimPayload | null = null;

  constructor(
    public dailyRewardService: DailyRewardService,
    private ads: AdsService,
    private modalCtrl: ModalController,
  ) {}

  get rewards() {
    return this.dailyRewardService.rewards;
  }

  get state() {
    return this.dailyRewardService.getState();
  }

  get currentDay() {
    return this.state.currentDay;
  }

  get claimedToday() {
    return this.state.claimedToday;
  }

  get hasClaimed() {
    return this.claimedNow || this.claimedToday;
  }

  async claimReward() {
    if (this.claimLoading || this.hasClaimed) return;

    this.claimLoading = true;

    try {
      const reward = this.dailyRewardService.getCurrentReward();

      await this.handleReward(reward, 1);
    } finally {
      this.claimLoading = false;
    }
  }

  get canDoubleReward() {
    return (
      this.cinematicVisible &&
      this.cinematicPhase === 'reward' &&
      !!this.doubleRewardPayload &&
      !this.doubleRewardClaimed
    );
  }

  finishCinematic(force = false) {
    if (!this.cinematicVisible || this.cinematicPhase !== 'reward') return;
    if (this.doubleRewardLoading) return;
    if (this.canDoubleReward && !force) return;

    this.cinematicVisible = false;
    this.continue();
  }

  async doubleCurrentReward(event?: Event) {
    event?.stopPropagation();

    if (
      this.doubleRewardLoading ||
      !this.canDoubleReward ||
      !this.doubleRewardPayload
    ) {
      return;
    }

    this.doubleRewardLoading = true;

    try {
      const rewarded = await this.ads.showRewardedAd();

      if (!rewarded) return;

      const applied = await this.dailyRewardService.applyRewardBonus(
        this.doubleRewardPayload,
      );

      if (!applied) return;

      this.doubleRewardClaimed = true;
      this.updateRevealLabelAfterDouble(this.doubleRewardPayload);
    } finally {
      this.doubleRewardLoading = false;
    }
  }

  continue() {
    this.modalCtrl.dismiss();
  }

  private async handleReward(
    reward: DailyReward,
    multiplier: number,
  ): Promise<boolean> {
    const preparedClaim = this.prepareRewardClaim(reward, multiplier);

    if (!preparedClaim) return false;

    const claimed = await this.dailyRewardService.claimTodayWithReward(
      preparedClaim.payload,
    );

    if (!claimed) return false;

    this.claimedNow = true;
    this.chestReward = preparedClaim.chestReward ?? null;
    this.epicAvatarReward = preparedClaim.epicAvatarReward ?? null;
    this.unlockedAvatar = preparedClaim.unlockedAvatar ?? null;
    this.doubleRewardPayload = this.getDoubleRewardPayload(
      preparedClaim.payload,
    );
    this.doubleRewardClaimed = false;

    if (preparedClaim.chestReward) {
      await this.playChestCinematic(preparedClaim.chestReward);
    } else {
      await this.playRewardCinematic(
        preparedClaim.revealIcon,
        preparedClaim.revealLabel,
        preparedClaim.revealType,
      );
    }

    return true;
  }

  private getDoubleRewardPayload(
    payload: DailyRewardClaimPayload,
  ): DailyRewardClaimPayload | null {
    if (payload.coins && payload.coins > 0) {
      return {
        rewardDay: payload.rewardDay,
        coins: payload.coins,
      };
    }

    if (payload.xp && payload.xp > 0) {
      return {
        rewardDay: payload.rewardDay,
        xp: payload.xp,
      };
    }

    return null;
  }

  private updateRevealLabelAfterDouble(payload: DailyRewardClaimPayload) {
    if (payload.coins && payload.coins > 0) {
      this.rewardRevealLabel = `+${payload.coins * 2} Coins`;
      return;
    }

    if (payload.xp && payload.xp > 0) {
      this.rewardRevealLabel = `+${payload.xp * 2} XP`;
    }
  }

  private prepareRewardClaim(
    reward: DailyReward,
    multiplier: number,
  ): PreparedDailyRewardClaim | null {
    if (reward.type === 'coins' && reward.amount) {
      const amount = reward.amount * multiplier;

      return {
        payload: {
          rewardDay: reward.day,
          coins: amount,
        },
        revealIcon: 'assets/ui/coin-turtle.webp',
        revealLabel: `+${amount} Coins`,
        revealType: 'coins',
      };
    }

    if (reward.type === 'xp' && reward.amount) {
      const amount = reward.amount * multiplier;

      return {
        payload: {
          rewardDay: reward.day,
          xp: amount,
        },
        revealIcon: reward.icon,
        revealLabel: `+${amount} XP`,
        revealType: 'xp',
      };
    }

    if (reward.type === 'avatar') {
      const avatar = this.dailyRewardService.getRandomDailyAvatar();

      return {
        payload: {
          rewardDay: reward.day,
          avatarId: avatar.id,
        },
        revealIcon: avatar.icon || reward.icon,
        revealLabel: avatar.label,
        revealType: 'avatar',
        unlockedAvatar: avatar,
      };
    }

    if (reward.type === 'chest') {
      const chestReward = this.dailyRewardService.getRandomEpicChestReward();
      const epicAvatarReward =
        chestReward.type === 'avatar'
          ? this.dailyRewardService.getRandomEpicAvatar()
          : undefined;

      const payload: DailyRewardClaimPayload = {
        rewardDay: reward.day,
      };

      if (chestReward.type === 'coins' && chestReward.amount) {
        payload.coins = chestReward.amount;
      }

      if (chestReward.type === 'xp' && chestReward.amount) {
        payload.xp = chestReward.amount;
      }

      if (chestReward.type === 'avatar' && epicAvatarReward) {
        payload.avatarId = epicAvatarReward.id;
      }

      return {
        payload,
        revealIcon: epicAvatarReward?.icon || chestReward.icon,
        revealLabel: epicAvatarReward?.label || chestReward.label,
        revealType: 'chest',
        chestReward,
        epicAvatarReward,
        unlockedAvatar: epicAvatarReward,
      };
    }

    return null;
  }

  private async playChestCinematic(chestReward: DailyChestReward) {
    if (chestReward.type === 'avatar') {
      this.rewardRevealIcon = this.epicAvatarReward?.icon || chestReward.icon;

      this.rewardRevealLabel =
        this.epicAvatarReward?.label || chestReward.label;

      this.rewardRevealType = 'chest';
    } else {
      this.rewardRevealIcon = chestReward.icon;
      this.rewardRevealLabel = chestReward.label;
      this.rewardRevealType = 'chest';
    }

    this.cinematicVisible = true;
    this.cinematicPhase = 'opening';

    await this.wait(1600);

    this.cinematicPhase = 'flash';

    await this.wait(650);

    this.cinematicPhase = 'reward';
  }

  private async playRewardCinematic(
    icon: string,
    label: string,
    type: RevealType,
  ) {
    this.rewardRevealIcon = icon;
    this.rewardRevealLabel = label;
    this.rewardRevealType = type;

    this.cinematicVisible = true;
    this.cinematicPhase = 'flash';

    await this.wait(550);

    this.cinematicPhase = 'reward';
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
