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
    console.log('✅ App avviata');

    const isMobile = Capacitor.getPlatform() !== 'web';
    console.log(isMobile ? '📱 Piattaforma mobile' : '💻 Web/PWA');

    console.log('🧩 Ionic components definiti correttamente');

    this.updateActiveTabFromUrl(this.router.url);

    this.audioService.initHomeMusic();
    this.audioService.playMusic();
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

  async handleGlobalClick() {
    await this.audioService.playMusic();
    this.audioService.playClick();
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }
}
