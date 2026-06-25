import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController, IonicModule } from '@ionic/angular';
import { Observable, Subscription } from 'rxjs';

import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import {
  AnteprimaForziere,
  ShopService,
  TipoForziere,
} from 'src/app/services/shop.service';

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './shop.page.html',
  styleUrls: ['./shop.page.scss'],
})
export class ShopPage implements OnInit, OnDestroy {
  private livesSub?: Subscription;

  coinRewardPulse = false;
  coinsLoading = false;
  lifeLoading = false;
  lifeRecoveredPulse = false;

  chestLoading: TipoForziere | null = null;

  private previousLives?: number;
  readonly maxLives = 5;
  readonly coinIconPath = 'assets/ui/coin-turtle.webp';

  coins$: Observable<number>;
  lives$: Observable<number>;
  livesCountdown$: Observable<string>;

  constructor(
    private ads: AdsService,
    private coinsService: CoinsService,
    private livesService: LivesService,
    private shopService: ShopService,
    private alertController: AlertController,
  ) {
    this.coins$ = this.coinsService.coins$;
    this.lives$ = this.livesService.lives$;
    this.livesCountdown$ = this.livesService.countdown$;
  }

  ngOnInit() {
    this.livesSub = this.lives$.subscribe((lives) => {
      if (this.previousLives !== undefined && lives > this.previousLives) {
        this.triggerLifePulse();
      }

      this.previousLives = lives;
    });
  }

  // Avvia il flusso di acquisto del forziere selezionato.
  async compraForziere(tipo: TipoForziere) {
    if (this.chestLoading || this.coinsLoading || this.lifeLoading) return;

    this.chestLoading = tipo;

    try {
      const anteprima = await this.shopService.preparaAnteprimaForziere(tipo);
      const confermato = await this.mostraConfermaForziere(anteprima);

      if (!confermato) return;

      const pagamentoOk = await this.avviaPagamentoPlaceholder(
        anteprima.config.productId,
      );

      if (!pagamentoOk) return;

      const risultato = await this.shopService.riscattaForziere(tipo);

      this.triggerCoinPulse();

      await this.mostraPremioForziere(
        anteprima.config.titolo,
        risultato.coins,
        risultato.xp,
        risultato.avatar?.label,
        risultato.fallbackUsato,
      );
    } catch (error) {
      console.error('Errore acquisto forziere:', error);
      await this.mostraErroreAcquisto();
    } finally {
      this.chestLoading = null;
    }
  }

  // Mostra la modale prima del pagamento, inclusa la variante con fallback se gli avatar sono finiti.
  private async mostraConfermaForziere(
    anteprima: AnteprimaForziere,
  ): Promise<boolean> {
    const messaggioAvatar = this.getMessaggioAvatarAnteprima(anteprima);

    const alert = await this.alertController.create({
      header: anteprima.config.titolo,
      subHeader: anteprima.config.prezzo,
      message: `
        <div class="shop-alert-content">
          <p>Riceverai:</p>
          <ul>
            <li>
              <img class="alert-coin-icon" src="${this.coinIconPath}" alt="Coins" />
              <strong>${anteprima.coinsFinali}</strong> TurtleCoins
            </li>
            <li>⭐ <strong>${anteprima.xpFinali}</strong> XP</li>
            ${messaggioAvatar}
          </ul>
        </div>
      `,
      buttons: [
        {
          text: 'Annulla',
          role: 'cancel',
        },
        {
          text: 'Continua',
          role: 'confirm',
        },
      ],
      cssClass: anteprima.usaFallbackCoins
        ? 'shop-alert fallback-alert'
        : 'shop-alert',
    });

    await alert.present();

    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  // Crea il testo della modale per avatar garantito o coins sostitutive.
  private getMessaggioAvatarAnteprima(anteprima: AnteprimaForziere): string {
    if (!anteprima.haAvatarGarantito) {
      return '';
    }

    if (anteprima.usaFallbackCoins) {
      return `
        <li class="fallback-row">
          Hai già tutti gli avatar disponibili: riceverai monete bonus al posto dell'avatar.
        </li>
      `;
    }

    const tipoAvatar =
      anteprima.config.avatarSource === 'epic' ? 'Epico' : 'Daily';

    return `
      <li>
        🎭 <strong>1 Avatar ${tipoAvatar}</strong> non posseduto
      </li>
      <li class="small-row">
        Disponibili: ${anteprima.avatarDisponibili}/${anteprima.avatarTotali}
      </li>
    `;
  }

  // Placeholder temporaneo: qui collegheremo Google Play Billing.
  private async avviaPagamentoPlaceholder(productId: string): Promise<boolean> {
    console.log('Pagamento placeholder per productId:', productId);

    return true;
  }

  // Mostra il riepilogo del premio ricevuto dopo l'acquisto.
  private async mostraPremioForziere(
    titolo: string,
    coins: number,
    xp: number,
    avatarLabel?: string,
    fallbackUsato = false,
  ) {
    const avatarMessage = avatarLabel
      ? `<p>🎭 Nuovo avatar: <strong>${avatarLabel}</strong></p>`
      : fallbackUsato
        ? `<p>🎉 Avatar già tutti sbloccati: hai ricevuto monete bonus!</p>`
        : '';

    const alert = await this.alertController.create({
      header: 'Forziere aperto!',
      subHeader: titolo,
      message: `
        <div class="shop-alert-content reward">
          <p>
            <img class="alert-coin-icon" src="${this.coinIconPath}" alt="Coins" />
            <strong>+${coins}</strong> TurtleCoins
          </p>
          <p>⭐ <strong>+${xp}</strong> XP</p>
          ${avatarMessage}
        </div>
      `,
      buttons: ['Fantastico!'],
      cssClass: 'shop-alert reward-alert',
    });

    await alert.present();
  }

  // Mostra una modale generica in caso di errore acquisto.
  private async mostraErroreAcquisto() {
    const alert = await this.alertController.create({
      header: 'Acquisto non completato',
      message:
        'Si è verificato un problema durante l’acquisto. Riprova tra poco.',
      buttons: ['Ok'],
      cssClass: 'shop-alert',
    });

    await alert.present();
  }

  async watchCoinsAd() {
    if (this.coinsLoading || this.lifeLoading || this.chestLoading) return;

    this.coinsLoading = true;

    try {
      const reward = await this.ads.showRewardedAd();

      if (reward) {
        await this.coinsService.addCoins(10);
        this.triggerCoinPulse();
      }
    } catch (error) {
      console.error('Errore rewarded ad monete:', error);
    } finally {
      this.coinsLoading = false;
    }
  }

  triggerCoinPulse() {
    this.coinRewardPulse = true;

    setTimeout(() => {
      this.coinRewardPulse = false;
    }, 900);
  }

  async watchLifeAd() {
    if (this.lifeLoading || this.coinsLoading || this.chestLoading) return;

    if (this.livesService.getLives() >= this.maxLives) {
      return;
    }

    this.lifeLoading = true;

    try {
      const reward = await this.ads.showRewardedAd();

      if (reward) {
        await this.livesService.addLife(1);
      }
    } catch (error) {
      console.error('Errore rewarded ad vita:', error);
    } finally {
      this.lifeLoading = false;
    }
  }

  triggerLifePulse() {
    this.lifeRecoveredPulse = true;

    setTimeout(() => {
      this.lifeRecoveredPulse = false;
    }, 900);
  }

  ngOnDestroy() {
    this.livesSub?.unsubscribe();
  }
}
