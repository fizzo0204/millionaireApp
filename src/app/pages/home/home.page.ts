import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Observable, Subscription, map, of, switchMap } from 'rxjs';
import { Router } from '@angular/router';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AnonymousModalComponent } from '../../components/anonymous-modal/anonymous-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import { DailyRewardModalComponent } from 'src/app/components/daily-reward-modal/daily-reward-modal.component';
import { UiService } from 'src/app/services/ui.service';
import { CATEGORIES } from 'src/app/data/categories.data';
import { CategoryModel } from 'src/app/models/category.model';
import { ModalController } from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, CommonModule, AnonymousModalComponent],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  private userSub?: Subscription;
  private livesSub?: Subscription;

  private previousLives?: number;
  readonly maxLives = 5;

  showAnonModal = false;
  coinsLoading = false;
  lifeLoading = false;
  showDailyReward = false;
  coinRewardPulse = false;
  lifeRecoveredPulse = false;

  coins$: Observable<number>;
  lives$: Observable<number>;
  livesCountdown$: Observable<string>;
  quizPlayed$: Observable<number> = this.auth.user$.pipe(
    switchMap((user) => {
      if (!user || user.isAnonymous) {
        return of(0);
      }

      return this.userStatsService
        .getUserProfile(user.uid)
        .pipe(map((profile) => profile?.stats?.quizPlayed ?? 0));
    }),
  );

  categories: CategoryModel[] = [...CATEGORIES];

  constructor(
    private auth: AuthService,
    private ads: AdsService,
    private coinsService: CoinsService,
    private livesService: LivesService,
    private router: Router,
    private userStatsService: UserStatsService,
    private ui: UiService,
    private modalCtrl: ModalController,
  ) {
    this.coins$ = this.coinsService.coins$;
    this.lives$ = this.livesService.lives$;
    this.livesCountdown$ = this.livesService.countdown$;
  }

  ngOnInit() {
    this.ads.showBanner();

    this.userSub = this.auth.user$.subscribe((user) => {
      this.showAnonModal = !!user?.isAnonymous;
    });

    this.livesSub = this.lives$.subscribe((lives) => {
      if (this.previousLives !== undefined && lives > this.previousLives) {
        this.triggerLifePulse();
      }

      this.previousLives = lives;
    });
  }

  selectCategory(categoryId: string) {
    this.router.navigateByUrl(`/difficulty/${categoryId}`);
  }

  async watchCoinsAd() {
    if (this.coinsLoading || this.lifeLoading) return;

    this.coinsLoading = true;

    try {
      const reward = await this.ads.showRewardedAd();

      if (reward) {
        await this.coinsService.addCoins(10);
        this.triggerCoinPulse();
      }
    } catch (error) {
      console.error('Errore rewarded ad monete:', error);
    } finally {
      this.coinsLoading = false;
    }
  }

  async watchLifeAd() {
    if (this.lifeLoading || this.coinsLoading) return;

    if (this.livesService.getLives() >= this.maxLives) {
      return;
    }

    this.lifeLoading = true;

    try {
      const reward = await this.ads.showRewardedAd();

      if (reward) {
        await this.livesService.addLife(1);
      }
    } catch (error) {
      console.error('Errore rewarded ad vita:', error);
    } finally {
      this.lifeLoading = false;
    }
  }

  triggerCoinPulse() {
    this.coinRewardPulse = true;

    setTimeout(() => {
      this.coinRewardPulse = false;
    }, 900);
  }

  triggerLifePulse() {
    this.lifeRecoveredPulse = true;

    setTimeout(() => {
      this.lifeRecoveredPulse = false;
    }, 900);
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.livesSub?.unsubscribe();
    this.ads.hideBanner();
  }

  async openDailyReward() {
    const modal = await this.modalCtrl.create({
      component: DailyRewardModalComponent,
      cssClass: 'daily-reward-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();
  }

  closeDailyReward() {
    this.showDailyReward = false;
    this.ui.closeModalOverlay();
  }
}
