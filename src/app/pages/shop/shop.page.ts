import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';

import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import { AudioService } from 'src/app/services/audio';

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './shop.page.html',
  styleUrls: ['./shop.page.scss'],
})
export class ShopPage implements OnInit, OnDestroy {
  private livesSub?: Subscription;
  private previousLives?: number;
  coinRewardPulse = false;

  readonly maxLives = 5;

  coinsLoading = false;
  lifeLoading = false;
  lifeRecoveredPulse = false;

  coins$: Observable<number>;
  lives$: Observable<number>;
  livesCountdown$: Observable<string>;

  constructor(
    private ads: AdsService,
    private audioService: AudioService,
    private coinsService: CoinsService,
    private livesService: LivesService,
  ) {
    this.coins$ = this.coinsService.coins$;
    this.lives$ = this.livesService.lives$;
    this.livesCountdown$ = this.livesService.countdown$;
  }

  ngOnInit() {
    this.ads.showBanner();

    this.livesSub = this.lives$.subscribe((lives) => {
      if (this.previousLives !== undefined && lives > this.previousLives) {
        this.triggerLifePulse();
      }

      this.previousLives = lives;
    });
  }

  async watchCoinsAd() {
    if (this.coinsLoading || this.lifeLoading) return;

    this.coinsLoading = true;

    const reward = await this.ads.showRewardedAd();

    if (reward) {
      await this.coinsService.addCoins(10);
      if (reward) {
        await this.coinsService.addCoins(10);
        this.triggerCoinPulse();
      }
    }

    this.coinsLoading = false;
  }

  triggerCoinPulse() {
    this.coinRewardPulse = true;

    setTimeout(() => {
      this.coinRewardPulse = false;
    }, 900);
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

  triggerLifePulse() {
    this.lifeRecoveredPulse = true;

    setTimeout(() => {
      this.lifeRecoveredPulse = false;
    }, 900);
  }

  ngOnDestroy() {
    this.livesSub?.unsubscribe();
    this.ads.hideBanner();
  }
}
