import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DAILY_EVENTS_CONFIG } from 'src/app/config/daily-events.config';
import { DailyEventsData } from 'src/app/models/daily-events.model';
import { DailyEventsService } from 'src/app/services/daily-events.service';

@Component({
  selector: 'app-events-challenge',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-challenge.page.html',
  styleUrls: ['./events-challenge.page.scss'],
})
export class EventsChallengePage implements OnInit {
  private router = inject(Router);
  private dailyEventsService = inject(DailyEventsService);

  loading = true;
  dailyEventsData: DailyEventsData | null = null;

  readonly dailyChallengeQuestionCount =
    DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount;
  readonly dailyChallengeCoinsReward =
    DAILY_EVENTS_CONFIG.dailyChallengeCoinsReward;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refresh();
  }

  get dailyChallengeCompleted(): boolean {
    return !this.dailyEventsService.isDailyChallengeAvailable(
      this.dailyEventsData,
    );
  }

  get bestDailyCorrect(): number {
    return this.dailyEventsData?.dailyChallenge.bestCorrectToday ?? 0;
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

  startDailyChallenge(): void {
    if (this.dailyChallengeCompleted) return;

    this.router.navigateByUrl('/daily-challenge');
  }

  goBack(): void {
    this.router.navigateByUrl('/events');
  }

}
