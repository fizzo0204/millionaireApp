import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { DAILY_EVENTS_CONFIG } from 'src/app/config/daily-events.config';
import {
  DailyEventsData,
  DailyMissionView,
} from 'src/app/models/daily-events.model';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

interface EventHubCard {
  id: 'missions' | 'dailyReward' | 'wheel' | 'challenge';
  route: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  tone: string;
}

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events.page.html',
  styleUrls: ['./events.page.scss'],
})
export class EventsPage implements OnInit {
  private navigation = inject(NavigationTransitionService);
  private dailyEventsService = inject(DailyEventsService);
  private dailyRewardService = inject(DailyRewardService);

  loading = true;
  missions: DailyMissionView[] = [];
  dailyEventsData: DailyEventsData | null = null;

  readonly cards: EventHubCard[] = [
    {
      id: 'missions',
      route: '/events/missions',
      eyebrow: 'Completa le missioni',
      title: 'Missioni giornaliere',
      description: 'Sette obiettivi diversi ogni giorno.',
      icon: 'checkmark-circle',
      tone: 'missions',
    },
    {
      id: 'dailyReward',
      route: '/events/daily-reward',
      eyebrow: 'Bonus quotidiano',
      title: 'Reward giornaliera',
      description:
        'Controlla il calendario e riscatta il premio quando è pronto.',
      icon: 'gift',
      tone: 'reward',
    },
    {
      id: 'wheel',
      route: '/events/wheel',
      eyebrow: 'Un giro al giorno',
      title: 'Ruota della fortuna',
      description:
        'Vinci sempre, un giro gratis al giorno e altri giri con video.',
      icon: 'sparkles-outline',
      tone: 'wheel',
    },
    {
      id: 'challenge',
      route: '/events/challenge',
      eyebrow: 'Sfida casuale',
      title: 'Minigioco daily',
      description:
        'Dieci domande miste: se sbagli riparti, se le indovini tutte vinci.',
      icon: 'game-controller-outline',
      tone: 'challenge',
    },
  ];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refresh();
  }

  get completedMissions(): number {
    return this.missions.filter((mission) => mission.completed).length;
  }

  get totalMissions(): number {
    return this.missions.length;
  }

  get claimableMissions(): number {
    return this.missions.filter(
      (mission) => mission.completed && !mission.claimed,
    ).length;
  }

  get dailyRewardClaimedToday(): boolean {
    return this.dailyRewardService.getState().claimedToday;
  }

  get wheelFreeSpinAvailable(): boolean {
    return this.dailyEventsService.isWheelFreeSpinAvailable(
      this.dailyEventsData,
    );
  }

  get dailyChallengeCompleted(): boolean {
    return !this.dailyEventsService.isDailyChallengeAvailable(
      this.dailyEventsData,
    );
  }

  async refresh(): Promise<void> {
    this.loading = true;

    try {
      const [missions, data] = await Promise.all([
        this.dailyEventsService.getTodayMissions(),
        this.dailyEventsService.getTodayDataForCurrentUser(),
      ]);

      this.missions = missions;
      this.dailyEventsData = data;
    } finally {
      this.loading = false;
    }
  }

  openEvent(route: string): void {
    void this.navigation.navigateByUrl(route);
  }

  getCardStatus(card: EventHubCard): string {
    switch (card.id) {
      case 'missions':
        if (this.claimableMissions > 0) return `${this.claimableMissions} pronte`;
        if (this.totalMissions === 0) return 'Apri';
        return `${this.completedMissions}/${this.totalMissions}`;
      case 'dailyReward':
        return this.dailyRewardClaimedToday ? 'Riscosso' : 'Pronto';
      case 'wheel':
        return this.wheelFreeSpinAvailable ? 'Gratis' : 'Video';
      case 'challenge':
        return this.dailyChallengeCompleted
          ? 'Completata'
          : `${DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount} domande`;
    }
  }

}
