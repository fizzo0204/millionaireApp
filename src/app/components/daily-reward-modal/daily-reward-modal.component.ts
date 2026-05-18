import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ModalController } from '@ionic/angular';

import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { CoinsService } from 'src/app/services/coins.service';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AuthService } from 'src/app/services/auth.service';
import { AdsService } from 'src/app/services/ads.service';

import {
  DailyChestReward,
  DailyReward,
  CinematicPhase,
  RevealType,
} from 'src/app/models/daily-reward.model';
import { AvatarModel } from 'src/app/models/avatar.model';

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

  unlockedAvatar: AvatarModel | null = null;
  chestReward: DailyChestReward | null = null;
  epicAvatarReward: AvatarModel | null = null;

  cinematicVisible = false;
  cinematicPhase: CinematicPhase = 'opening';

  rewardRevealLabel = '';
  rewardRevealIcon = '';
  rewardRevealType: RevealType = 'coins';

  constructor(
    public dailyRewardService: DailyRewardService,
    private coinsService: CoinsService,
    private userStatsService: UserStatsService,
    private auth: AuthService,
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

      await this.dailyRewardService.claimToday();
      this.claimedNow = true;
    } finally {
      this.claimLoading = false;
    }
  }

  async claimDoubleReward() {
    if (this.claimLoading || this.hasClaimed) return;

    this.claimLoading = true;

    try {
      const rewarded = await this.ads.showRewardedAd();

      if (!rewarded) return;

      const reward = this.dailyRewardService.getCurrentReward();

      await this.handleReward(reward, 2);

      await this.dailyRewardService.claimToday();
      this.claimedNow = true;
    } finally {
      this.claimLoading = false;
    }
  }

  finishCinematic() {
    if (!this.cinematicVisible || this.cinematicPhase !== 'reward') return;

    this.cinematicVisible = false;
    this.continue();
  }

  continue() {
    this.modalCtrl.dismiss();
  }

  private async handleReward(reward: DailyReward, multiplier: number) {
    if (reward.type === 'chest') {
      this.claimedNow = true;

      const chestReward = this.dailyRewardService.getRandomEpicChestReward();

      this.chestReward = chestReward;

      if (chestReward.type === 'avatar') {
        this.epicAvatarReward =
          this.dailyRewardService.getRandomEpicAvatar() ?? null;
      }

      await this.playChestCinematic(chestReward);

      await this.applyChestReward(chestReward);

      return;
    }

    if (reward.type === 'coins' && reward.amount) {
      const amount = reward.amount * multiplier;

      await this.playRewardCinematic(
        'assets/ui/coin-turtle.webp',
        `+${amount} Coins`,
        'coins',
      );

      await this.coinsService.addCoins(amount);
      return;
    }

    if (reward.type === 'xp' && reward.amount) {
      const amount = reward.amount * multiplier;

      await this.playRewardCinematic('⚡', `+${amount} XP`, 'xp');

      await this.addXp(amount);
      return;
    }

    if (reward.type === 'avatar') {
      const avatar = this.dailyRewardService.getRandomDailyAvatar();

      await this.dailyRewardService.saveUnlockedAvatar(avatar);

      this.unlockedAvatar = avatar;

      await this.playRewardCinematic(
        avatar.icon || '🎨',
        avatar.label,
        'avatar',
      );
    }
  }

  private async applyChestReward(chestReward: DailyChestReward) {
    if (chestReward.type === 'coins' && chestReward.amount) {
      await this.coinsService.addCoins(chestReward.amount);
      return;
    }

    if (chestReward.type === 'xp' && chestReward.amount) {
      await this.addXp(chestReward.amount);
      return;
    }

    if (chestReward.type === 'avatar') {
      if (!this.epicAvatarReward) return;

      await this.dailyRewardService.saveUnlockedAvatar(this.epicAvatarReward);

      this.unlockedAvatar = this.epicAvatarReward;
    }
  }

  private async addXp(amount: number) {
    const user = await firstValueFrom(this.auth.user$);

    if (user && !user.isAnonymous) {
      await this.userStatsService.addXp(user.uid, amount);
    }
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
