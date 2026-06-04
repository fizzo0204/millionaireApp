import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import {
  DailyMissionConfig,
  DailyMissionView,
} from 'src/app/models/daily-events.model';
import { Subscription } from 'rxjs';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { HapticsService } from 'src/app/services/haptics.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

@Component({
  selector: 'app-events-missions',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-missions.page.html',
  styleUrls: ['./events-missions.page.scss'],
})
export class EventsMissionsPage implements OnInit, OnDestroy {
  private navigation = inject(NavigationTransitionService);
  private dailyEventsService = inject(DailyEventsService);
  private haptics = inject(HapticsService);

  loading = true;
  missionClaimLoadingId: string | null = null;
  missionSwitchLoadingId: string | null = null;
  recentlyClaimedMissionId: string | null = null;
  recentlySwitchedMissionId: string | null = null;
  missions: DailyMissionView[] = [];
  private claimAnimationTimer?: ReturnType<typeof setTimeout>;
  private switchAnimationTimer?: ReturnType<typeof setTimeout>;
  private lastFastSwitchEventAt = 0;
  private dayChangedSub?: Subscription;

  async ngOnInit(): Promise<void> {
    this.dayChangedSub = this.dailyEventsService.dayChanged$.subscribe(() => {
      void this.refresh();
    });

    await this.refresh();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refresh();
  }

  get completedMissions(): number {
    return this.missions.filter((mission) => mission.completed).length;
  }

  get missionProgressPercent(): number {
    if (this.missions.length === 0) return 0;

    return (this.completedMissions / this.missions.length) * 100;
  }

  getMissionPercent(mission: DailyMissionView): number {
    return Math.min(100, (mission.progress / mission.target) * 100);
  }

  async refresh(showLoader = true): Promise<void> {
    if (showLoader) {
      this.loading = true;
    }

    try {
      this.missions = await this.dailyEventsService.getTodayMissions();
    } finally {
      if (showLoader) {
        this.loading = false;
      }
    }
  }

  async claimMission(mission: DailyMissionView): Promise<void> {
    if (
      !mission.completed ||
      mission.claimed ||
      this.missionClaimLoadingId ||
      this.missionSwitchLoadingId
    ) {
      return;
    }

    this.missionClaimLoadingId = mission.id;

    try {
      const coins = await this.dailyEventsService.claimMissionReward(
        mission.id,
      );

      if (coins > 0) {
        this.markMissionAsClaimed(mission.id);
        this.showClaimAnimation(mission.id);
        void this.haptics.success();
        return;
      }

      await this.refresh();
    } finally {
      this.missionClaimLoadingId = null;
    }
  }

  async switchMission(event: Event, mission: DailyMissionView): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (this.shouldIgnoreDuplicatedSwitchEvent(event)) {
      return;
    }

    if (
      !mission.canSwitch ||
      this.missionSwitchLoadingId ||
      this.missionClaimLoadingId
    ) {
      return;
    }

    this.missionSwitchLoadingId = mission.id;

    try {
      const replacement = await this.dailyEventsService.switchDailyMission(
        mission.originalMissionId,
      );

      if (replacement) {
        this.replaceMissionAfterSwitch(mission, replacement);
        void this.haptics.light();
        this.showSwitchAnimation(replacement.id);

        return;
      }

      await this.refresh(false);
    } finally {
      this.missionSwitchLoadingId = null;
    }
  }

  goBack(): void {
    void this.navigation.navigateByUrl('/events');
  }

  ngOnDestroy(): void {
    this.dayChangedSub?.unsubscribe();
    this.clearClaimAnimationTimer();
    this.clearSwitchAnimationTimer();
  }

  private showClaimAnimation(missionId: string): void {
    this.clearClaimAnimationTimer();
    this.recentlyClaimedMissionId = missionId;

    this.claimAnimationTimer = setTimeout(() => {
      this.recentlyClaimedMissionId = null;
      this.claimAnimationTimer = undefined;
    }, 1200);
  }

  private clearClaimAnimationTimer(): void {
    if (!this.claimAnimationTimer) return;

    clearTimeout(this.claimAnimationTimer);
    this.claimAnimationTimer = undefined;
  }

  private showSwitchAnimation(missionId: string): void {
    this.clearSwitchAnimationTimer();
    this.recentlySwitchedMissionId = missionId;

    this.switchAnimationTimer = setTimeout(() => {
      this.recentlySwitchedMissionId = null;
      this.switchAnimationTimer = undefined;
    }, 900);
  }

  private clearSwitchAnimationTimer(): void {
    if (!this.switchAnimationTimer) return;

    clearTimeout(this.switchAnimationTimer);
    this.switchAnimationTimer = undefined;
  }

  private shouldIgnoreDuplicatedSwitchEvent(event: Event): boolean {
    const now = Date.now();

    if (event.type === 'click' && now - this.lastFastSwitchEventAt < 700) {
      return true;
    }

    if (event.type === 'touchstart' || event.type === 'mousedown') {
      this.lastFastSwitchEventAt = now;
    }

    return false;
  }

  private replaceMissionAfterSwitch(
    oldMission: DailyMissionView,
    replacement: DailyMissionConfig,
  ): void {
    this.missions = this.missions.map((mission) => {
      if (mission.id !== oldMission.id) return mission;

      return {
        ...replacement,
        originalMissionId: oldMission.originalMissionId,
        progress: 0,
        claimed: false,
        completed: false,
        switched: true,
        canSwitch: false,
      };
    });
  }

  private markMissionAsClaimed(missionId: string): void {
    this.missions = this.missions.map((mission) => {
      if (mission.id !== missionId) return mission;

      return {
        ...mission,
        claimed: true,
        completed: true,
        progress: mission.target,
      };
    });
  }
}
