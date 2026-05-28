import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DailyMissionView } from 'src/app/models/daily-events.model';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { HapticsService } from 'src/app/services/haptics.service';

@Component({
  selector: 'app-events-missions',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-missions.page.html',
  styleUrls: ['./events-missions.page.scss'],
})
export class EventsMissionsPage implements OnInit {
  private router = inject(Router);
  private dailyEventsService = inject(DailyEventsService);
  private haptics = inject(HapticsService);

  loading = true;
  missionClaimLoadingId: string | null = null;
  missions: DailyMissionView[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refresh();
  }

  get completedMissions(): number {
    return this.missions.filter((mission) => mission.claimed).length;
  }

  get missionProgressPercent(): number {
    if (this.missions.length === 0) return 0;

    return (this.completedMissions / this.missions.length) * 100;
  }

  getMissionPercent(mission: DailyMissionView): number {
    return Math.min(100, (mission.progress / mission.target) * 100);
  }

  async refresh(): Promise<void> {
    this.loading = true;

    try {
      this.missions = await this.dailyEventsService.getTodayMissions();
    } finally {
      this.loading = false;
    }
  }

  async claimMission(mission: DailyMissionView): Promise<void> {
    if (!mission.completed || mission.claimed || this.missionClaimLoadingId) {
      return;
    }

    this.missionClaimLoadingId = mission.id;

    try {
      const coins = await this.dailyEventsService.claimMissionReward(
        mission.id,
      );

      if (coins > 0) {
        void this.haptics.success();
      }

      await this.refresh();
    } finally {
      this.missionClaimLoadingId = null;
    }
  }

  goBack(): void {
    this.router.navigateByUrl('/events');
  }
}
