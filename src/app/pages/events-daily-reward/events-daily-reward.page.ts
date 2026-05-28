import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { DailyRewardModalComponent } from 'src/app/components/daily-reward-modal/daily-reward-modal.component';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { DailyRewardService } from 'src/app/services/daily-reward.service';

@Component({
  selector: 'app-events-daily-reward',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-daily-reward.page.html',
  styleUrls: ['./events-daily-reward.page.scss'],
})
export class EventsDailyRewardPage implements OnInit {
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private dailyEventsService = inject(DailyEventsService);
  private dailyRewardService = inject(DailyRewardService);

  loading = true;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refresh();
  }

  get dailyRewardClaimedToday(): boolean {
    return this.dailyRewardService.getState().claimedToday;
  }

  get dailyRewardDay(): number {
    return this.dailyRewardService.getState().currentDay;
  }

  async refresh(): Promise<void> {
    this.loading = true;

    try {
      await this.dailyEventsService.getTodayDataForCurrentUser();
    } finally {
      this.loading = false;
    }
  }

  async openDailyReward(): Promise<void> {
    await this.dailyEventsService.trackDailyRewardCheck();
    await this.refresh();

    const modal = await this.modalCtrl.create({
      component: DailyRewardModalComponent,
      cssClass: 'daily-reward-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();
    await modal.onDidDismiss();
    await this.refresh();
  }

  goBack(): void {
    this.router.navigateByUrl('/events');
  }
}
