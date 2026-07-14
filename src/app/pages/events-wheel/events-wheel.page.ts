import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { DAILY_WHEEL_REWARDS } from 'src/app/config/daily-events.config';
import {
  DailyEventsData,
  DailyWheelRewardResult,
} from 'src/app/models/daily-events.model';
import { AdsService } from 'src/app/services/ads.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { HapticsService } from 'src/app/services/haptics.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

@Component({
  selector: 'app-events-wheel',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-wheel.page.html',
  styleUrls: ['./events-wheel.page.scss'],
})
export class EventsWheelPage implements OnInit, OnDestroy {
  private navigation = inject(NavigationTransitionService);
  private ads = inject(AdsService);
  private dailyEventsService = inject(DailyEventsService);
  private haptics = inject(HapticsService);

  loading = true;
  wheelSpinning = false;
  wheelSettling = false;
  wheelImpact = false;
  wheelRotation = 0;
  wheelReward: DailyWheelRewardResult | null = null;
  wheelDoubleLoading = false;
  dailyEventsData: DailyEventsData | null = null;

  readonly wheelRewards = DAILY_WHEEL_REWARDS;

  private tickTimers: ReturnType<typeof setTimeout>[] = [];
  private impactTimer?: ReturnType<typeof setTimeout>;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refresh();
  }

  ngOnDestroy(): void {
    this.clearWheelTimers();
  }

  get wheelFreeSpinAvailable(): boolean {
    return this.dailyEventsService.isWheelFreeSpinAvailable(
      this.dailyEventsData,
    );
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

    this.clearWheelTimers();
    this.wheelReward = null;
    this.wheelSpinning = true;
    this.wheelSettling = false;
    this.wheelImpact = false;

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

      const currentAngle = ((this.wheelRotation % 360) + 360) % 360;
      const extraRotationToTarget = (targetAngle - currentAngle + 360) % 360;

      this.wheelRotation += 2160 + extraRotationToTarget;
      this.scheduleWheelTicks();

      this.tickTimers.push(
        setTimeout(() => {
          this.wheelSettling = true;
        }, 1750),
      );

      await this.wait(2800);

      this.wheelSettling = false;
      this.wheelImpact = true;
      void this.haptics.success();

      this.impactTimer = setTimeout(() => {
        this.wheelImpact = false;
        this.impactTimer = undefined;
      }, 520);

      await this.wait(420);

      this.wheelReward = result;
      await this.refresh();
    } finally {
      this.wheelSpinning = false;
      this.wheelSettling = false;
    }
  }

  async doubleWheelReward(): Promise<void> {
    if (
      !this.wheelReward ||
      this.wheelReward.doubled ||
      this.wheelDoubleLoading
    ) {
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
    void this.navigation.navigateByUrl('/events');
  }

  private scheduleWheelTicks(): void {
    const tickMoments = [
      110, 210, 305, 395, 485, 575, 665, 760, 860, 965, 1080, 1200, 1330, 1470,
      1620, 1780, 1950, 2130, 2320, 2520, 2700,
    ];

    for (const delay of tickMoments) {
      const timer = setTimeout(() => {
        if (!this.wheelSpinning) return;

        void this.haptics.light();
      }, delay);

      this.tickTimers.push(timer);
    }
  }

  private clearWheelTimers(): void {
    for (const timer of this.tickTimers) {
      clearTimeout(timer);
    }

    this.tickTimers = [];

    if (this.impactTimer) {
      clearTimeout(this.impactTimer);
      this.impactTimer = undefined;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
