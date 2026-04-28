import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Subscription, Observable } from 'rxjs';
import { AnonymousModalComponent } from '../../components/anonymous-modal/anonymous-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { HomeNavbarComponent } from 'src/app/components/home-navbar/home-navbar.component';
import { BottomNavComponent } from 'src/app/components/bottom-nav/bottom-nav.component';
import { LivesService } from 'src/app/services/lives';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    HomeNavbarComponent,
    BottomNavComponent,
    AnonymousModalComponent,
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  private userSub?: Subscription;
  private livesSub?: Subscription;
  private previousLives?: number;
  showAnonModal = false;
  lifeRecoveredPulse = false;

  coins$: Observable<number>;
  lives$: Observable<number>;
  livesCountdown$: Observable<string>;
  activeTab = 'home';

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
    private coinsService: CoinsService,
    private livesService: LivesService,
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
    console.log(`🎮 Categoria selezionata: ${categoryId}`);
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
    console.log(`📌 Tab selezionato: ${tab}`);
  }

  async watchAd() {
    const reward = await this.ads.showRewardedAd();

    if (reward) {
      await this.coinsService.addCoins(10);
      console.log('⭐ Ricompensa ottenuta: +10 monete');
    }
  }

  async testSpendLife() {
    await this.livesService.spendLife();
  }

  async testResetLives() {
    await this.livesService.resetLives();
  }

  triggerLifePulse() {
    this.lifeRecoveredPulse = true;

    setTimeout(() => {
      this.lifeRecoveredPulse = false;
    }, 900);
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.ads.hideBanner();
    this.livesSub?.unsubscribe();
  }
}
