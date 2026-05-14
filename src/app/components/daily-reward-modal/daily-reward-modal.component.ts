import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { CoinsService } from 'src/app/services/coins.service';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AuthService } from 'src/app/services/auth.service';
import { firstValueFrom } from 'rxjs';
import { AdsService } from 'src/app/services/ads.service';
import { DailyAvatarReward } from 'src/app/services/daily-reward.service';

@Component({
  selector: 'app-daily-reward-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-reward-modal.component.html',
  styleUrls: ['./daily-reward-modal.component.scss'],
})
export class DailyRewardModalComponent {
  @Output() closed = new EventEmitter<void>();

  claimedNow = false;
  unlockedAvatar: DailyAvatarReward | null = null;

  constructor(
    public dailyRewardService: DailyRewardService,
    private coinsService: CoinsService,
    private userStatsService: UserStatsService,
    private auth: AuthService,
    private ads: AdsService,
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
    const reward = this.dailyRewardService.getCurrentReward();

    if (reward.type === 'coins' && reward.amount) {
      await this.coinsService.addCoins(reward.amount);
    }

    if (reward.type === 'xp' && reward.amount) {
      const user = await firstValueFrom(this.auth.user$);

      if (user && !user.isAnonymous) {
        await this.userStatsService.addXp(user.uid, reward.amount);
      }
    }

    if (reward.type === 'avatar') {
      const avatar = this.dailyRewardService.getRandomDailyAvatar();

      this.dailyRewardService.saveUnlockedAvatar(avatar);

      this.unlockedAvatar = avatar;
    }

    this.dailyRewardService.claimToday();
    this.claimedNow = true;
  }

  async claimDoubleReward() {
    const rewarded = await this.ads.showRewardedAd();

    if (!rewarded) {
      return;
    }

    const reward = this.dailyRewardService.getCurrentReward();

    if (reward.type === 'coins' && reward.amount) {
      await this.coinsService.addCoins(reward.amount * 2);
    }

    if (reward.type === 'xp' && reward.amount) {
      const user = await firstValueFrom(this.auth.user$);

      if (user && !user.isAnonymous) {
        await this.userStatsService.addXp(user.uid, reward.amount * 2);
      }
    }

    if (reward.type === 'avatar') {
      const avatar = this.dailyRewardService.getRandomDailyAvatar();

      this.dailyRewardService.saveUnlockedAvatar(avatar);

      this.unlockedAvatar = avatar;
    }

    this.dailyRewardService.claimToday();
    this.claimedNow = true;
  }

  continue() {
    this.closed.emit();
  }
}
