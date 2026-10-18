import { Component, OnDestroy, HostListener, inject } from '@angular/core';
import {
  AlertController,
  IonicModule,
  ModalController,
  Platform,
  PopoverController,
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
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
import { User } from 'firebase/auth';
import { UiService } from './services/ui.service';
import { AuthService } from './services/auth.service';
import { UserStatsService } from './services/user-stats.service';
import { HomeNavbarComponent } from './components/home-navbar/home-navbar.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';
import { AudioService } from './services/audio';
import { AdsService } from './services/ads.service';
import { GameLoaderComponent } from './components/game-loader/game-loader.component';
import { LevelUpModalComponent } from './components/level-up-modal/level-up-modal.component';
import { TutorialOverlayComponent } from './components/tutorial-overlay/tutorial-overlay.component';
import { AchievementToastComponent } from './components/achievement-toast/achievement-toast.component';
import { ForceUpdateOverlayComponent } from './components/force-update-overlay/force-update-overlay.component';
import { LevelUpModalService } from './services/level-up-modal.service';
import { DailyEventsService } from './services/daily-events.service';
import { DailyRewardAutoOpenService } from './services/daily-reward-auto-open.service';
import { AssetPreloadService } from './services/asset-preload.service';
import { AchievementToastService } from './services/achievement-toast.service';
import { NotificationsService } from './services/notifications.service';
import { PurchasesService } from './services/purchases.service';
import { AppUpdateService } from './services/app-update.service';
import { TutorialService } from './services/tutorial.service';
import { NavigationTab } from './models/navigation.model';
import { APP_CONFIG } from 'src/app/config/app.config';
import { APP_UPDATE_CONFIG } from 'src/app/config/app-update.config';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    HomeNavbarComponent,
    BottomNavComponent,
    GameLoaderComponent,
    LevelUpModalComponent,
    TutorialOverlayComponent,
    AchievementToastComponent,
    ForceUpdateOverlayComponent,
  ],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnDestroy {
  @HostListener('document:pointerdown', ['$event'])
  handleDocumentPointerDown(event: PointerEvent) {
    if (this.showAppLoader) return;
    this.handleGlobalPointerDown();
  }

  activeTab: NavigationTab = 'home';
  user$: Observable<User | null> = this.auth.user$;
  bannerHeightPx$: Observable<number>;

  showAppLoader = true;
  /*
   * Vero quando la versione installata e' sotto appConfig/android.minVersionCode:
   * il gioco non viene proprio montato (shell, router, overlay globali) e i
   * flussi automatici (daily reward, toast, tutorial) non partono. Resta
   * visibile solo ForceUpdateOverlayComponent.
   */
  updateRequired = false;
  hideBottomNav = false;
  private gameStarted = false;
  private updateSub?: Subscription;
  private musicStarted = false;
  private isMobile = false;

  ui = inject(UiService);
  private routerSub?: Subscription;
  private levelSub?: Subscription;
  private appStateListener?: PluginListenerHandle;
  private trackedLevelUserId: string | null = null;
  private lastTrackedLevel: number | null = null;
  private userSub?: Subscription;

  constructor(
    private platform: Platform,
    private auth: AuthService,
    private userStatsService: UserStatsService,
    private levelUpModal: LevelUpModalService,
    private audioService: AudioService,
    private adsService: AdsService,
    private dailyEventsService: DailyEventsService,
    private dailyRewardAutoOpen: DailyRewardAutoOpenService,
    private assetPreload: AssetPreloadService,
    private achievementToast: AchievementToastService,
    private notificationsService: NotificationsService,
    private purchasesService: PurchasesService,
    private router: Router,
    private appUpdate: AppUpdateService,
    private tutorialService: TutorialService,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private popoverCtrl: PopoverController,
  ) {
    this.bannerHeightPx$ = this.adsService.bannerHeight$;
    void this.dailyEventsService;
    void this.purchasesService;
    this.initializeApp();
    this.listenToRouteChanges();
    this.listenToLevelChanges();
    this.listenToUserForNotifications();
  }

  async initializeApp() {
    await Promise.all([
      this.prepareApp(),
      this.waitForInitialUser(),
      this.appUpdate.waitForInitialStatus(APP_UPDATE_CONFIG.initialStatusWaitMs),
      this.wait(APP_CONFIG.loaderDuration),
    ]);

    this.updateRequired = this.appUpdate.isUpdateRequired();
    this.showAppLoader = false;
    this.syncBannerVisibility();

    /*
     * Aggiornamento forzato (2026-10-18): prima l'overlay di update conviveva
     * col gioco gia' avviato, e la modale del daily reward (o tutorial, login
     * ospite, ecc.) si apriva sopra di lui: per aggiornare bisognava prima
     * riscattare il reward. Ora, se serve l'update, il gioco non parte; se
     * minVersionCode cambia a sessione aperta, il gioco viene smontato e le
     * modali gia' aperte chiuse.
     */
    this.updateSub = this.appUpdate.updateRequired$.subscribe((required) => {
      this.updateRequired = required;

      if (required) {
        void this.closeGameOverlays();
        return;
      }

      this.startGame();
    });
  }

  private startGame() {
    if (this.gameStarted) return;

    this.gameStarted = true;
    this.assetPreload.preloadPriorityImages();
    this.dailyRewardAutoOpen.start();
    this.achievementToast.start();
  }

  // Chiude tutto cio' che il gioco puo' aver aperto sopra l'app.
  private async closeGameOverlays() {
    if (this.tutorialService.getCurrentState().visible) {
      this.tutorialService.close();
    }

    const controllers = [this.modalCtrl, this.alertCtrl, this.popoverCtrl];

    for (const controller of controllers) {
      // Tetto di sicurezza: un overlay che rifiuta il dismiss non deve bloccare il ciclo.
      for (let attempt = 0; attempt < 10; attempt++) {
        const top = await controller.getTop();

        if (!top) break;

        await top.dismiss().catch(() => false);
      }
    }
  }

  /*
   * Aspetta la prima emissione di un utente autenticato (anonimo incluso)
   * prima di far sparire lo splash, non solo platform.ready() + un timer
   * fisso: altrimenti header/navbar/home diventano visibili prima che i dati
   * utente siano davvero pronti, restando "bloccati" fino a quando lo stream
   * si popola. Limitato da loaderAuthWaitMs per non restare bloccati sullo
   * splash all'infinito se l'avvio e' davvero offline.
   */
  private waitForInitialUser(): Promise<void> {
    return firstValueFrom(
      this.auth.user$.pipe(
        filter((user) => !!user),
        take(1),
        timeout({
          first: APP_CONFIG.loaderAuthWaitMs,
          with: () => of(null),
        }),
        catchError(() => of(null)),
        map(() => undefined),
      ),
    );
  }

  private async prepareApp() {
    await this.platform.ready();

    this.isMobile = Capacitor.getPlatform() !== 'web';

    this.audioService.initHomeMusic();

    await this.listenToAppState();

    if (this.isMobile) {
      await this.tryStartMusic();
    }
  }

  private async listenToAppState() {
    /*
     * Volutamente NON chiamiamo notificationsService.cancelAll() quando l'app
     * torna in foreground: LocalNotifications.cancel() rimuove anche una
     * notifica gia' consegnata e visibile (dismissVisibleNotification lato
     * nativo), quindi cancellava anche promemoria appena arrivati un istante
     * prima che l'utente riaprisse l'app. Lo stato si autocorregge comunque
     * al prossimo giro in background: scheduleAll() ricalcola e cancella la
     * notifica se la condizione non vale piu' (vite piene, reward gia'
     * riscosso).
     */
    this.appStateListener = await CapacitorApp.addListener(
      'appStateChange',
      ({ isActive }) => {
        if (isActive) {
          if (this.musicStarted) {
            void this.tryStartMusic();
          }

          this.syncBannerVisibility();

          if (!this.updateRequired) {
            this.dailyRewardAutoOpen.notifyAppBecameActive();
          }
          return;
        }

        this.audioService.pauseMusic();
        void this.notificationsService.scheduleAll();
      },
    );
  }

  private listenToUserForNotifications() {
    this.userSub = this.auth.user$.subscribe((user) => {
      if (!user) {
        void this.notificationsService.cancelAll();
      }
    });
  }

  handleGlobalPointerDown() {
    this.audioService.playClick();

    /*
     * Su mobile l'autoplay puo essere bloccato finche l'utente non tocca
     * lo schermo. Per questo ritentiamo al primo gesto utile se la musica
     * non è ancora partita davvero.
     */
    if (this.audioService.isMusicEnabled() && !this.audioService.isPlaying()) {
      void this.tryStartMusic();
    }
  }

  private async tryStartMusic() {
    const started = await this.audioService.playMusic();

    if (started) {
      this.musicStarted = true;
    }
  }

  private listenToRouteChanges() {
    this.routerSub = this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
      )
      .subscribe((event) => {
        this.updateActiveTabFromUrl(event.urlAfterRedirects);
        this.syncBannerVisibility();

        if (!this.updateRequired) {
          void this.dailyRewardAutoOpen.checkAndOpen({ delayMs: 250 });
        }
      });
  }

  private listenToLevelChanges() {
    this.levelSub = this.auth.user$
      .pipe(
        switchMap((user) => {
          if (!user) return of(null);

          // Il level-up vale anche per il profilo ospite anonimo.
          return this.userStatsService.getUserProfile(user.uid).pipe(
            map((profile) => {
              const stats = profile?.stats;
              const level = stats?.level;

              if (typeof level !== 'number') return null;

              return {
                uid: user.uid,
                level,
                levelRewardLastClaimedLevel:
                  typeof stats?.levelRewardLastClaimedLevel === 'number'
                    ? stats.levelRewardLastClaimedLevel
                    : null,
              };
            }),
          );
        }),
      )
      .subscribe((snapshot) => {
        if (!snapshot) {
          this.trackedLevelUserId = null;
          this.lastTrackedLevel = null;
          return;
        }

        if (snapshot.uid !== this.trackedLevelUserId) {
          this.trackedLevelUserId = snapshot.uid;
          this.lastTrackedLevel = snapshot.level;
          return;
        }

        const previousLevel = this.lastTrackedLevel;

        if (previousLevel !== null && snapshot.level > previousLevel) {
          this.lastTrackedLevel = snapshot.level;
          this.showLevelUpModal(
            snapshot.uid,
            previousLevel,
            snapshot.level,
            snapshot.levelRewardLastClaimedLevel,
          );
          return;
        }

        this.lastTrackedLevel = snapshot.level;
      });
  }

  private showLevelUpModal(
    uid: string,
    previousLevel: number,
    currentLevel: number,
    lastClaimedLevel: number | null,
  ) {
    /*
     * NON fare Math.max(..., previousLevel): stessa correzione di
     * UserQuizDataService.claimLevelUpCoinsReward, che e' la fonte di verita'
     * per le monete davvero assegnate - qui calcoliamo solo l'anteprima
     * mostrata nella modale, deve restare coerente con quel calcolo o
     * l'utente vede un numero e ne riceve un altro.
     */
    const rewardFromLevel = lastClaimedLevel ?? previousLevel;
    const levelsToReward = Math.max(0, currentLevel - rewardFromLevel);
    const coinsReward = levelsToReward * USER_STATS_CONFIG.levelUpCoinsReward;

    this.levelUpModal.show(uid, currentLevel, previousLevel, coinsReward);
  }

  private updateActiveTabFromUrl(url: string) {
    const cleanUrl = url.split('?')[0];

    this.hideBottomNav = APP_CONFIG.hiddenBottomNavRoutes.some((route) =>
      cleanUrl.startsWith(route),
    );

    const isHome = cleanUrl === '/home';

    if (
      !this.hideBottomNav &&
      (!isHome || !this.ui.hideBottomNavForSubpage())
    ) {
      this.ui.showBottomNavForInnerPage();
    }

    if (cleanUrl.startsWith('/shop')) {
      this.activeTab = 'negozio';
      return;
    }

    if (cleanUrl.startsWith('/events')) {
      this.activeTab = 'eventi';
      return;
    }

    if (cleanUrl.startsWith('/settings')) {
      this.activeTab = 'impostazioni';
      return;
    }

    if (cleanUrl.startsWith('/profile')) {
      this.activeTab = 'profilo';
      return;
    }

    this.activeTab = 'home';
  }

  private syncBannerVisibility() {
    if (!this.isMobile) return;

    /*
     * Il banner AdMob è fisso in basso e deve restare visibile anche quando
     * il tutorial naviga tra più pagine dell'app.
     */
    void this.adsService.showBanner();
  }

  setActiveTab(tab: NavigationTab) {
    this.activeTab = tab;
  }

  get navHidden(): boolean {
    return (
      this.hideBottomNav ||
      this.ui.hideBottomNavForModal() ||
      this.ui.hideBottomNavForSubpage()
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.levelSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.updateSub?.unsubscribe();
    this.achievementToast.stop();
    this.appStateListener?.remove();
  }
}
