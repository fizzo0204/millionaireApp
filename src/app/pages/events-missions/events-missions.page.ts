import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import {
  DailyMissionConfig,
  DailyMissionView,
} from 'src/app/models/daily-events.model';
import { Subscription } from 'rxjs';
import { AdsService } from 'src/app/services/ads.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { DailyMissionService } from 'src/app/services/daily-mission.service';
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
  private dailyMissionService = inject(DailyMissionService);
  private ads = inject(AdsService);
  private haptics = inject(HapticsService);

  loading = true;
  missionClaimLoadingId: string | null = null;
  missionSwitchLoadingId: string | null = null;
  recentlyClaimedMissionId: string | null = null;
  recentlySwitchedMissionId: string | null = null;
  showFinalMissionRewardModal = false;
  finalMissionRewardCoins = 0;
  finalMissionRewardDoubleLoading = false;
  finalMissionRewardDoubled = false;
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
      await this.checkFinalMissionRewardIfNeeded();
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
      const result = await this.dailyEventsService.claimMissionReward(
        mission.id,
      );

      if (result.rewardCoins > 0) {
        this.markMissionAsClaimed(mission.id);
        this.showClaimAnimation(mission.id);
        void this.haptics.success();

        if (result.finalRewardClaimed && result.finalRewardCoins > 0) {
          this.showFinalMissionReward(result.finalRewardCoins);
        }

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
      /*
       * La prima sostituzione della missione e gratuita.
       * Se la missione e gia stata cambiata almeno una volta, chiediamo
       * un video premio prima di generare una nuova missione.
       */
      if (mission.switchRequiresAd) {
        const rewarded = await this.ads.showRewardedAd(false);

        if (!rewarded) {
          return;
        }
      }

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

  // Permette di raddoppiare il premio finale delle 7 missioni giornaliere
  // guardando un video. Il raddoppio è salvato su Firestore e può avvenire
  // una sola volta al giorno.
  async doubleFinalMissionReward(): Promise<void> {
    if (
      this.finalMissionRewardDoubleLoading ||
      this.finalMissionRewardDoubled ||
      !this.showFinalMissionRewardModal
    ) {
      return;
    }

    this.finalMissionRewardDoubleLoading = true;

    try {
      const rewarded = await this.ads.showRewardedAd();

      if (!rewarded) return;

      const result = await this.dailyMissionService.doubleFinalMissionsReward();

      if (result.extraCoins > 0) {
        this.finalMissionRewardCoins = result.totalRewardCoins;
        this.finalMissionRewardDoubled = true;
        void this.haptics.success();
      }
    } finally {
      this.finalMissionRewardDoubleLoading = false;
    }
  }

  closeFinalMissionReward(): void {
    this.showFinalMissionRewardModal = false;
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
        canSwitch: true,
        switchRequiresAd: true,
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

  // Controlla se tutte le missioni sono state riscattate e, in quel caso,
  // prova ad assegnare il premio finale. Serve anche per gli utenti che avevano
  // gia completato tutto prima della fix.
  private async checkFinalMissionRewardIfNeeded(): Promise<void> {
    if (this.missions.length === 0) return;
    if (!this.missions.every((mission) => mission.claimed)) return;

    const result =
      await this.dailyEventsService.claimFinalMissionsRewardIfAvailable();

    if (result.finalRewardClaimed && result.finalRewardCoins > 0) {
      this.showFinalMissionReward(result.finalRewardCoins);
    }
  }

  // Mostra la modale finale quando l'utente completa e riscatta tutte
  // le missioni giornaliere.
  private showFinalMissionReward(coins: number): void {
    this.finalMissionRewardCoins = coins;
    this.finalMissionRewardDoubled = coins > 25;
    this.finalMissionRewardDoubleLoading = false;
    this.showFinalMissionRewardModal = true;
    void this.haptics.success();
  }
}
