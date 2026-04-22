import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Subscription, Observable } from 'rxjs';

import { LoginButtonComponent } from '../../components/login-button/login-button.component';
import { AnonymousModalComponent } from '../../components/anonymous-modal/anonymous-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    LoginButtonComponent,
    AnonymousModalComponent,
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  private userSub?: Subscription;
  showAnonModal = false;

  coins$: Observable<number>;

  constructor(
    private auth: AuthService,
    private ads: AdsService,
    private coinsService: CoinsService,
  ) {
    this.coins$ = this.coinsService.coins$;
  }

  ngOnInit() {
    this.ads.showBanner();

    this.userSub = this.auth.user$.subscribe((user) => {
      this.showAnonModal = !!user?.isAnonymous;
    });
  }

  selectLevel(level: string) {
    console.log(`🎮 Hai selezionato il livello: ${level}`);
  }

  async watchAd() {
    const reward = await this.ads.showRewardedAd();

    if (reward) {
      await this.coinsService.addCoins(10);
      console.log('⭐ Ricompensa ottenuta: +10 monete');
    }
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.ads.hideBanner();
  }
}
