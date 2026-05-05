import { Component, OnDestroy } from '@angular/core';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Observable, Subscription, filter } from 'rxjs';
import { User } from 'firebase/auth';

import { AuthService } from './services/auth.service';
import { AudioService } from './services/audio';
import { HomeNavbarComponent } from './components/home-navbar/home-navbar.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonicModule, CommonModule, HomeNavbarComponent, BottomNavComponent],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnDestroy {
  activeTab = 'home';
  user$: Observable<User | null> = this.auth.user$;

  private routerSub?: Subscription;
  private musicStarted = false;
  private isMobile = false;

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
    await this.platform.ready();

    this.isMobile = Capacitor.getPlatform() !== 'web';

    this.audioService.initHomeMusic();

    if (this.isMobile) {
      this.musicStarted = true;
      this.audioService.playMusic();
    }
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

    if (cleanUrl.startsWith('/settings')) {
      this.activeTab = 'impostazioni';
      return;
    }

    if (cleanUrl.startsWith('/leaderboard')) {
      this.activeTab = 'classifica';
      return;
    }

    if (cleanUrl.startsWith('/shop')) {
      this.activeTab = 'negozio';
      return;
    }

    this.activeTab = 'home';
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }
}
