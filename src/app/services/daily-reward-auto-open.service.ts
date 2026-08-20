import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import {
  Subscription,
  catchError,
  filter,
  firstValueFrom,
  of,
  take,
  timeout,
} from 'rxjs';
import { DailyRewardModalComponent } from 'src/app/components/daily-reward-modal/daily-reward-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { TutorialService } from 'src/app/services/tutorial.service';

@Injectable({
  providedIn: 'root',
})
export class DailyRewardAutoOpenService implements OnDestroy {
  private readonly blockedRoutePrefixes = [
    '/quiz',
    '/daily-challenge',
    '/arcade/play',
  ];

  private routeSub?: Subscription;
  private tutorialSub?: Subscription;
  private midnightTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private started = false;
  private opening = false;
  private pendingCheck = false;
  private tutorialWasVisible = false;
  private autoOpenedDate: string | null = null;

  constructor(
    private auth: AuthService,
    private dailyEventsService: DailyEventsService,
    private dailyRewardService: DailyRewardService,
    private modalCtrl: ModalController,
    private router: Router,
    private tutorialService: TutorialService,
  ) {}

  start(): void {
    if (this.started) return;

    this.started = true;
    this.tutorialWasVisible = this.tutorialService.getCurrentState().visible;

    this.routeSub = this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
      )
      .subscribe(() => {
        void this.checkAndOpen();
      });

    this.tutorialSub = this.tutorialService.state$.subscribe((state) => {
      if (state.visible) {
        this.tutorialWasVisible = true;
        this.pendingCheck = true;
        return;
      }

      if (this.tutorialWasVisible) {
        this.tutorialWasVisible = false;
        this.pendingCheck = false;
        void this.checkAndOpen({ ignoreSessionGuard: true, delayMs: 350 });
      }
    });

    this.scheduleNextMidnightCheck();
    void this.dailyEventsService.syncTodayDataForCurrentUser();
    void this.checkAndOpen({ delayMs: 600 });
  }

  notifyAppBecameActive(): void {
    void this.dailyEventsService.syncTodayDataForCurrentUser();
    void this.checkAndOpen({ delayMs: 350 });
  }

  async checkAndOpen(options?: {
    ignoreSessionGuard?: boolean;
    delayMs?: number;
  }): Promise<boolean> {
    if (!this.started || this.opening) return false;

    /*
     * La guardia va impostata QUI, prima di qualunque await: più trigger
     * indipendenti (cambio rotta, tutorial, timer di mezzanotte, resume da
     * background) possono chiamare checkAndOpen quasi in contemporanea, e se
     * "opening" diventa true solo più avanti (dopo i controlli su tutorial/
     * top modal/utente), tutte le chiamate arrivate nel frattempo superano la
     * guardia iniziale (ancora false) e finiscono per aprire ciascuna la
     * propria modale, impilandole. Bug reale trovato il 2026-08-20.
     */
    this.opening = true;

    let retryAfterClose = false;

    try {
      if (options?.delayMs) {
        await this.wait(options.delayMs);
      }

      if (this.isBlockedRoute(this.router.url)) {
        this.pendingCheck = true;
        return false;
      }

      if (await this.tutorialService.isTutorialPendingForCurrentUser()) {
        this.pendingCheck = true;
        return false;
      }

      if (this.tutorialService.getCurrentState().visible) {
        this.pendingCheck = true;
        return false;
      }

      const topModal = await this.modalCtrl.getTop();

      if (topModal) {
        this.pendingCheck = true;
        this.scheduleRetry();
        return false;
      }

      const user = await this.waitForUser();

      if (!user) return false;

      await this.dailyRewardService.refreshAvatarCacheForCurrentUser();

      const state = this.dailyRewardService.getState();
      const todayKey = this.getTodayKey();

      if (state.claimedToday) return false;
      if (!options?.ignoreSessionGuard && this.autoOpenedDate === todayKey) {
        return false;
      }

      this.pendingCheck = false;
      this.autoOpenedDate = todayKey;

      try {
        await this.dailyEventsService.trackDailyRewardCheck();
      } catch (error) {
        console.warn('Check daily reward non tracciato:', error);
      }

      const modal = await this.modalCtrl.create({
        component: DailyRewardModalComponent,
        cssClass: 'daily-reward-ion-modal',
        backdropDismiss: false,
      });

      await modal.present();
      await modal.onDidDismiss();

      if (this.pendingCheck && !this.isBlockedRoute(this.router.url)) {
        this.pendingCheck = false;
        retryAfterClose = true;
      }

      return true;
    } finally {
      /*
       * Reimpostata a false PRIMA di innescare l'eventuale retry, cosi' la
       * chiamata ricorsiva supera la guardia invece di bloccarsi su se stessa.
       */
      this.opening = false;

      if (retryAfterClose) {
        void this.checkAndOpen({ delayMs: 300 });
      }
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.tutorialSub?.unsubscribe();

    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  private scheduleNextMidnightCheck(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 1, 0);

    this.midnightTimer = setTimeout(() => {
      this.scheduleNextMidnightCheck();
      void this.dailyEventsService.syncTodayDataForCurrentUser();
      void this.checkAndOpen({ ignoreSessionGuard: true });
    }, nextMidnight.getTime() - now.getTime());
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;

      if (this.pendingCheck && !this.isBlockedRoute(this.router.url)) {
        void this.checkAndOpen({ delayMs: 250 });
      }
    }, 1500);
  }

  private isBlockedRoute(url: string): boolean {
    const cleanUrl = url.split('?')[0];

    return this.blockedRoutePrefixes.some((route) =>
      cleanUrl.startsWith(route),
    );
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
