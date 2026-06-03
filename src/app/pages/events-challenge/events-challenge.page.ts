import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { DAILY_EVENTS_CONFIG } from 'src/app/config/daily-events.config';
import { DailyEventsData } from 'src/app/models/daily-events.model';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

@Component({
  selector: 'app-events-challenge',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-challenge.page.html',
  styleUrls: ['./events-challenge.page.scss'],
})
export class EventsChallengePage implements OnInit {
  private navigation = inject(NavigationTransitionService);
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

    void this.navigation.navigateByUrl('/daily-challenge');
  }

  goBack(): void {
    void this.navigation.navigateByUrl('/events');
  }

}
