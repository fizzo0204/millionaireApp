import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import {
  Observable,
  Subscription,
  catchError,
  filter,
  firstValueFrom,
  map,
  of,
  switchMap,
  take,
  timeout,
} from 'rxjs';
import { Router } from '@angular/router';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AuthService } from 'src/app/services/auth.service';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import { DailyRewardModalComponent } from 'src/app/components/daily-reward-modal/daily-reward-modal.component';
import { CATEGORIES } from 'src/app/data/categories.data';
import { CategoryModel } from 'src/app/models/category.model';
import { ModalController } from '@ionic/angular/standalone';
import { AuthPromptService } from 'src/app/services/auth-prompt.service';
import { TutorialService } from 'src/app/services/tutorial.service';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  private livesSub?: Subscription;
  private tutorialSub?: Subscription;

  private previousLives?: number;
  private dailyRewardOpening = false;
  private dailyRewardAutoOpenedDate: string | null = null;
  private openDailyRewardAfterTutorial = false;
  readonly maxLives = 5;

  coinsLoading = false;
  lifeLoading = false;
  coinRewardPulse = false;
  lifeRecoveredPulse = false;

  coins$: Observable<number>;
  lives$: Observable<number>;
  livesCountdown$: Observable<string>;
  quizPlayed$: Observable<number> = this.auth.user$.pipe(
    switchMap((user) => {
      if (!user) {
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
    private modalCtrl: ModalController,
    private authPromptService: AuthPromptService,
    private tutorialService: TutorialService,
    private dailyRewardService: DailyRewardService,
    private dailyEventsService: DailyEventsService,
  ) {
    this.coins$ = this.coinsService.coins$;
    this.lives$ = this.livesService.lives$;
    this.livesCountdown$ = this.livesService.countdown$;
  }

  ngOnInit() {
    this.livesSub = this.lives$.subscribe((lives) => {
      if (this.previousLives !== undefined && lives > this.previousLives) {
        this.triggerLifePulse();
      }

      this.previousLives = lives;
    });

    this.tutorialSub = this.tutorialService.state$.subscribe((state) => {
      if (state.visible && state.completed) {
        this.openDailyRewardAfterTutorial = true;
        return;
      }

      if (!state.visible && this.openDailyRewardAfterTutorial) {
        this.openDailyRewardAfterTutorial = false;
        void this.openDailyRewardIfAvailable({ ignoreSessionGuard: true });
      }
    });
  }

  async ionViewWillEnter() {
    /*
     * Il login non blocca piu il gioco. Quando l'ospite torna in home,
     * ogni tanto proponiamo il salvataggio cloud con Google/Facebook.
     */
    const tutorialOpened =
      await this.tutorialService.openHomeTutorialIfNeeded();

    if (tutorialOpened) return;

    const dailyRewardOpened = await this.openDailyRewardIfAvailable();

    if (dailyRewardOpened) return;

    this.authPromptService.scheduleHomeGuestLoginPrompt();
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
    this.livesSub?.unsubscribe();
    this.tutorialSub?.unsubscribe();
  }

  async openDailyRewardIfAvailable(options?: {
    ignoreSessionGuard?: boolean;
  }): Promise<boolean> {
    if (this.dailyRewardOpening) return false;
    if (!this.router.url.startsWith('/home')) return false;

    await this.wait(220);

    const user = await this.waitForUser();

    if (!user) return false;

    await this.dailyRewardService.refreshAvatarCacheForCurrentUser();

    const state = this.dailyRewardService.getState();
    const todayKey = this.getTodayKey();

    if (state.claimedToday) return false;
    if (
      !options?.ignoreSessionGuard &&
      this.dailyRewardAutoOpenedDate === todayKey
    ) {
      return false;
    }

    this.dailyRewardOpening = true;
    this.dailyRewardAutoOpenedDate = todayKey;

    await this.dailyEventsService.trackDailyRewardCheck();

    const modal = await this.modalCtrl.create({
      component: DailyRewardModalComponent,
      cssClass: 'daily-reward-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();

    try {
      await modal.onDidDismiss();
    } finally {
      this.dailyRewardOpening = false;
    }

    return true;
  }

  private getTodayKey(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private waitForUser() {
    return firstValueFrom(
      this.auth.user$.pipe(
        filter((user) => !!user),
        take(1),
        timeout({
          first: 3500,
          with: () => of(null),
        }),
        catchError(() => of(null)),
      ),
    );
  }
}
