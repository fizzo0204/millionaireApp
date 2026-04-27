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
  ) {
    this.coins$ = this.coinsService.coins$;
  }

  ngOnInit() {
    this.ads.showBanner();

    this.userSub = this.auth.user$.subscribe((user) => {
      this.showAnonModal = !!user?.isAnonymous;
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

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.ads.hideBanner();
  }
}
