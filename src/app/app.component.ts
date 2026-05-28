import { Component, OnDestroy, HostListener, inject } from '@angular/core';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Observable, Subscription, filter, map, of, switchMap } from 'rxjs';
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
import { LevelUpModalService } from './services/level-up-modal.service';
import { NavigationTab } from './models/navigation.model';
import { APP_CONFIG } from 'src/app/config/app.config';
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

  showAppLoader = true;
  hideBottomNav = false;
  private musicStarted = false;
  private isMobile = false;

  ui = inject(UiService);
  private routerSub?: Subscription;
  private levelSub?: Subscription;
  private appStateListener?: PluginListenerHandle;
  private trackedLevelUserId: string | null = null;
  private lastTrackedLevel: number | null = null;

  constructor(
    private platform: Platform,
    private auth: AuthService,
    private userStatsService: UserStatsService,
    private levelUpModal: LevelUpModalService,
    private audioService: AudioService,
    private adsService: AdsService,
    private router: Router,
  ) {
    this.initializeApp();
    this.listenToRouteChanges();
    this.listenToLevelChanges();
  }

  async initializeApp() {
    await Promise.all([
      this.prepareApp(),
      this.wait(APP_CONFIG.loaderDuration),
    ]);

    this.showAppLoader = false;
    this.syncBannerVisibility();
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
    this.appStateListener = await CapacitorApp.addListener(
      'appStateChange',
      ({ isActive }) => {
        if (isActive) {
          if (this.musicStarted) {
            void this.tryStartMusic();
          }

          this.syncBannerVisibility();
          return;
        }

        this.audioService.pauseMusic();
      },
    );
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
    const rewardFromLevel = Math.max(
      lastClaimedLevel ?? previousLevel,
      previousLevel,
    );
    const levelsToReward = Math.max(0, currentLevel - rewardFromLevel);
    const coinsReward = levelsToReward * USER_STATS_CONFIG.levelUpCoinsReward;

    this.levelUpModal.show(uid, currentLevel, previousLevel, coinsReward);
  }

  private updateActiveTabFromUrl(url: string) {
    const cleanUrl = url.split('?')[0];

    this.hideBottomNav = APP_CONFIG.hiddenBottomNavRoutes.some((route) =>
      cleanUrl.startsWith(route),
    );

    if (cleanUrl.startsWith('/shop')) {
      this.activeTab = 'negozio';
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

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.levelSub?.unsubscribe();
    this.appStateListener?.remove();
  }
}
