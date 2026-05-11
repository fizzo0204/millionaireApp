import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Observable, Subscription, map, of, switchMap } from 'rxjs';
import { Router } from '@angular/router';
import {
  UserStatsService,
  AppUserProfile,
} from 'src/app/services/user-stats.service';
import { AnonymousModalComponent } from '../../components/anonymous-modal/anonymous-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import { AudioService } from 'src/app/services/audio';

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

  categories = [
    {
      id: 'sport',
      title: 'Sport',
      icon: '⚽',
      description: 'Calcio, basket, tennis e grandi campioni',
      className: 'sport',
    },
    {
      id: 'cinema',
      title: 'Cinema',
      icon: '🎬',
      description: 'Film, attori, registi e grandi classici',
      className: 'cinema',
    },
    {
      id: 'storia',
      title: 'Storia',
      icon: '🏛️',
      description: 'Eventi, personaggi e grandi epoche',
      className: 'storia',
    },
    {
      id: 'geografia',
      title: 'Geografia',
      icon: '🌍',
      description: 'Capitali, paesi, bandiere e luoghi',
      className: 'geografia',
    },
    {
      id: 'scienza',
      title: 'Scienza',
      icon: '🔬',
      description: 'Scoperte, invenzioni e curiosità',
      className: 'scienza',
    },
    {
      id: 'musica',
      title: 'Musica',
      icon: '🎵',
      description: 'Artisti, canzoni e leggende',
      className: 'musica',
    },
    {
      id: 'tecnologia',
      title: 'Tecnologia',
      icon: '💡',
      description: 'Innovazioni, gadget e futuro',
      className: 'tecnologia',
    },
    {
      id: 'altro',
      title: 'Altro',
      icon: '⭐',
      description: 'Tante domande a sorpresa',
      className: 'altro',
    },
  ];

  constructor(
    private auth: AuthService,
    private ads: AdsService,
    private audioService: AudioService,
    private coinsService: CoinsService,
    private livesService: LivesService,
    private router: Router,
    private userStatsService: UserStatsService,
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

    const reward = await this.ads.showRewardedAd();

    if (reward) {
      await this.coinsService.addCoins(10);
      this.triggerCoinPulse();
    }

    this.coinsLoading = false;
  }

  async watchLifeAd() {
    if (this.lifeLoading || this.coinsLoading) return;

    if (this.livesService.getLives() >= this.maxLives) {
      return;
    }

    this.lifeLoading = true;

    const reward = await this.ads.showRewardedAd();

    if (reward) {
      await this.livesService.addLife(1);
    }

    this.lifeLoading = false;
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
}
