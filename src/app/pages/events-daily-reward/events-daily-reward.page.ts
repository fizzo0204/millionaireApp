import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { DailyRewardModalComponent } from 'src/app/components/daily-reward-modal/daily-reward-modal.component';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

@Component({
  selector: 'app-events-daily-reward',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './events-daily-reward.page.html',
  styleUrls: ['./events-daily-reward.page.scss'],
})
export class EventsDailyRewardPage implements OnInit {
  private navigation = inject(NavigationTransitionService);
  private modalCtrl = inject(ModalController);
  private dailyEventsService = inject(DailyEventsService);
  private dailyRewardService = inject(DailyRewardService);

  loading = true;
  opening = false;

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

  get dailyRewardDisplayDay(): number {
    if (!this.dailyRewardClaimedToday) return this.dailyRewardDay;

    return this.dailyRewardDay <= 1 ? 7 : this.dailyRewardDay - 1;
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
    if (this.opening) return;

    /*
     * Guardia anti-doppio-tap/doppia-apertura: senza, un tap rapido o una
     * rete lenta possono impilare due DailyRewardModalComponent (lo stesso
     * problema gia' risolto altrove per l'apertura automatica, ma qui non
     * era coperto). Impostata subito, prima di qualunque await (incluso il
     * primo modalCtrl.getTop() qui sotto): il vecchio controllo faceva
     * `this.opening || (await this.modalCtrl.getTop())`, lasciando una
     * finestra di un microtask in cui due chiamate quasi simultanee
     * potevano superare entrambe il controllo prima che una delle due
     * impostasse il flag.
     */
    this.opening = true;

    try {
      // Non apre una seconda modale se una e' gia' in scena per un altro
      // motivo (es. auto-open).
      if (await this.modalCtrl.getTop()) return;

      await this.dailyEventsService.trackDailyRewardCheck();
      await this.refresh();

      if (await this.modalCtrl.getTop()) return;

      const modal = await this.modalCtrl.create({
        component: DailyRewardModalComponent,
        cssClass: 'daily-reward-ion-modal',
        backdropDismiss: false,
      });

      await modal.present();
      await modal.onDidDismiss();
      await this.refresh();
    } finally {
      this.opening = false;
    }
  }

  goBack(): void {
    void this.navigation.navigateByUrl('/events');
  }
}
