import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DAILY_WHEEL_REWARDS } from 'src/app/config/daily-events.config';
import {
  DailyEventsData,
  DailyWheelRewardResult,
} from 'src/app/models/daily-events.model';
import { AdsService } from 'src/app/services/ads.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { HapticsService } from 'src/app/services/haptics.service';

@Component({
  selector: 'app-events-wheel',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-wheel.page.html',
  styleUrls: ['./events-wheel.page.scss'],
})
export class EventsWheelPage implements OnInit {
  private router = inject(Router);
  private ads = inject(AdsService);
  private dailyEventsService = inject(DailyEventsService);
  private haptics = inject(HapticsService);

  loading = true;
  wheelSpinning = false;
  wheelRotation = 0;
  wheelReward: DailyWheelRewardResult | null = null;
  wheelDoubleLoading = false;
  dailyEventsData: DailyEventsData | null = null;

  readonly wheelRewards = DAILY_WHEEL_REWARDS;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refresh();
  }

  get wheelFreeSpinAvailable(): boolean {
    return this.dailyEventsData?.wheel.freeSpinDate !== this.todayKey;
  }

  getWheelLabelAngle(index: number): number {
    const segmentAngle = 360 / this.wheelRewards.length;

    return index * segmentAngle + segmentAngle / 2;
  }

  async refresh(): Promise<void> {
    this.loading = true;

    try {
      this.dailyEventsData =
        await this.dailyEventsService.getTodayDataForCurrentUser();
    } finally {
      this.loading = false;
    }
  }

  async spinWheel(): Promise<void> {
    if (this.wheelSpinning) return;

    const useAdSpin = !this.wheelFreeSpinAvailable;

    if (useAdSpin) {
      const rewarded = await this.ads.showRewardedAd();

      if (!rewarded) return;
    }

    this.wheelReward = null;
    this.wheelSpinning = true;

    try {
      const result = await this.dailyEventsService.spinWheel(useAdSpin);

      if (!result) return;

      const segmentIndex = this.wheelRewards.findIndex(
        (reward) => reward.id === result.reward.id,
      );
      const safeSegmentIndex = Math.max(segmentIndex, 0);
      const segmentAngle = 360 / this.wheelRewards.length;
      const targetAngle =
        360 - (safeSegmentIndex * segmentAngle + segmentAngle / 2);

      this.wheelRotation += 1440 + targetAngle;

      await this.wait(1700);

      this.wheelReward = result;
      void this.haptics.success();
      await this.refresh();
    } finally {
      this.wheelSpinning = false;
    }
  }

  async doubleWheelReward(): Promise<void> {
    if (!this.wheelReward || this.wheelReward.doubled || this.wheelDoubleLoading) {
      return;
    }

    this.wheelDoubleLoading = true;

    try {
      const rewarded = await this.ads.showRewardedAd();

      if (!rewarded) return;

      const doubled = await this.dailyEventsService.doubleWheelReward(
        this.wheelReward,
      );

      if (doubled) {
        this.wheelReward = doubled;
        void this.haptics.success();
      }
    } finally {
      this.wheelDoubleLoading = false;
    }
  }

  closeWheelReward(): void {
    this.wheelReward = null;
  }

  goBack(): void {
    this.router.navigateByUrl('/events');
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private get todayKey(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
