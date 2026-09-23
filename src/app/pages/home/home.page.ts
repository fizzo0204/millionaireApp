import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Observable, Subscription, map, of, switchMap } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { AuthService } from 'src/app/services/auth.service';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import { LIVES_CONFIG } from 'src/app/config/lives.config';
import { CATEGORIES } from 'src/app/data/categories.data';
import { CategoryModel } from 'src/app/models/category.model';
import { AuthPromptService } from 'src/app/services/auth-prompt.service';
import { TutorialService } from 'src/app/services/tutorial.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  private livesSub?: Subscription;

  activeView: 'menu' | 'categories' = 'menu';
  private previousLives?: number;
  readonly maxLives = LIVES_CONFIG.maxLives;

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
    private authPromptService: AuthPromptService,
    private tutorialService: TutorialService,
    private navigation: NavigationTransitionService,
    private ui: UiService,
    private route: ActivatedRoute,
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

    void this.handleHomeEntry();
  }

  /*
   * Volutamente in ngOnInit(), non in ionViewWillEnter(): quando l'outlet
   * di Ionic viene creato per la primissima volta (il nostro
   * @if(showAppLoader)/@else in app.component.html, l'outlet non esiste
   * finche' lo splash non sparisce), IonRouterOutlet attiva la rotta gia'
   * risolta chiamando activateWith() da dentro il proprio ngOnInit()
   * (vedi IonRouterOutlet.initializeOutletWithName() in
   * @ionic/angular/fesm2022/ionic-angular-common.mjs). In quella finestra
   * l'elemento nativo <ion-router-outlet> puo' non essere ancora "upgradato"
   * da Stencil (containerEl.commit non ancora disponibile): la transizione
   * che dispatcha ionViewWillEnter viene silenziosamente saltata, quindi il
   * tutorial/daily-reward non partono al primissimo avvio - solo alla
   * navigazione successiva, quando l'outlet e' gia' pronto. Bug segnalato
   * dall'utente su piu' telefoni (2026-09-23). ngOnInit() e' un hook Angular
   * puro, non passa da quella catena, e in questa app HomePage viene sempre
   * ricreata da zero ad ogni navigazione verso /home (nessun
   * RouteReuseStrategy custom, mai la stessa istanza riusata) - quindi
   * ngOnInit() copre in modo affidabile anche i rientri successivi, non solo
   * il primo avvio.
   */
  private async handleHomeEntry() {
    const view = this.route.snapshot.queryParamMap.get('view');

    if (view === 'categories') {
      this.activeView = 'categories';
      this.ui.hideBottomNavForInnerPage();

      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });

      return;
    }

    this.showMenu();

    const tutorialOpened =
      await this.tutorialService.openHomeTutorialIfNeeded();

    if (tutorialOpened) return;

    this.authPromptService.scheduleHomeGuestLoginPrompt();
  }

  selectCategory(categoryId: string) {
    void this.navigation.navigateByUrl(`/difficulty/${categoryId}`);
  }

  startArcade() {
    this.ui.hideBottomNavForInnerPage();
    void this.navigation.navigateByUrl('/arcade');
  }

  showCategories() {
    this.activeView = 'categories';
    this.ui.hideBottomNavForInnerPage();
  }

  showMenu() {
    this.activeView = 'menu';
    this.ui.showBottomNavForInnerPage();
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
    this.ui.showBottomNavForInnerPage();
    this.livesSub?.unsubscribe();
  }
}
