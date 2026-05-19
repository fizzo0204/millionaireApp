import { Component, OnDestroy, HostListener, inject } from '@angular/core';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Observable, Subscription, filter } from 'rxjs';
import { User } from 'firebase/auth';
import { UiService } from './services/ui.service';
import { AuthService } from './services/auth.service';
import { HomeNavbarComponent } from './components/home-navbar/home-navbar.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';
import { AudioService } from './services/audio';
import { GameLoaderComponent } from './components/game-loader/game-loader.component';
import { NavigationTab } from './models/navigation.model';
import { APP_CONFIG } from 'src/app/config/app.config';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    HomeNavbarComponent,
    BottomNavComponent,
    GameLoaderComponent,
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
  private appStateListener?: PluginListenerHandle;

  constructor(
    private platform: Platform,
    private auth: AuthService,
    private audioService: AudioService,
    private router: Router,
  ) {
    this.initializeApp();
    this.listenToRouteChanges();
  }

  async initializeApp() {
    await Promise.all([
      this.prepareApp(),
      this.wait(APP_CONFIG.loaderDuration),
    ]);

    this.showAppLoader = false;
  }

  private async prepareApp() {
    await this.platform.ready();

    this.isMobile = Capacitor.getPlatform() !== 'web';

    this.audioService.initHomeMusic();

    await this.listenToAppState();

    if (this.isMobile) {
      this.musicStarted = true;
      await this.audioService.playMusic();
    }
  }

  private async listenToAppState() {
    this.appStateListener = await CapacitorApp.addListener(
      'appStateChange',
      ({ isActive }) => {
        if (isActive) {
          if (this.musicStarted) {
            this.audioService.playMusic();
          }

          return;
        }

        this.audioService.pauseMusic();
      },
    );
  }

  handleGlobalPointerDown() {
    this.audioService.playClick();

    if (!this.isMobile && !this.musicStarted) {
      this.musicStarted = true;
      this.audioService.playMusic();
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
      });
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

  setActiveTab(tab: NavigationTab) {
    this.activeTab = tab;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.appStateListener?.remove();
  }
}
