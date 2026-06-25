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

  purchasePreview: AnteprimaForziere | null = null;
  purchaseAvatarRows: string[] = [];
  private purchaseConfirmResolver?: (value: boolean) => void;

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

  // Mostra la modale custom prima del pagamento.
  private async mostraConfermaForziere(
    anteprima: AnteprimaForziere,
  ): Promise<boolean> {
    this.purchasePreview = anteprima;
    this.purchaseAvatarRows = this.getRigheAvatarAnteprima(anteprima);

    return new Promise<boolean>((resolve) => {
      this.purchaseConfirmResolver = resolve;
    });
  }

  // Conferma l'acquisto dalla modale custom.
  confermaAcquistoModale() {
    this.purchaseConfirmResolver?.(true);
    this.chiudiModaleAcquisto();
  }

  // Annulla l'acquisto dalla modale custom.
  annullaAcquistoModale() {
    this.purchaseConfirmResolver?.(false);
    this.chiudiModaleAcquisto();
  }

  // Chiude e pulisce la modale custom.
  private chiudiModaleAcquisto() {
    this.purchasePreview = null;
    this.purchaseAvatarRows = [];
    this.purchaseConfirmResolver = undefined;
  }

  // Crea le righe testuali per avatar garantito o coins sostitutive.
  private getRigheAvatarAnteprima(anteprima: AnteprimaForziere): string[] {
    if (!anteprima.haAvatarGarantito) {
      return [];
    }

    if (anteprima.usaFallbackCoins) {
      return [
        'Hai già tutti gli avatar disponibili.',
        'Riceverai monete bonus al posto dell’avatar.',
      ];
    }

    const tipoAvatar =
      anteprima.config.avatarSource === 'epic' ? 'Epico' : 'Daily';

    return [
      `1 Avatar ${tipoAvatar} non posseduto`,
      `Disponibili: ${anteprima.avatarDisponibili}/${anteprima.avatarTotali}`,
    ];
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
    const alert = await this.alertController.create({
      header: 'Forziere aperto!',
      subHeader: titolo,
      message: [
        `🪙 +${coins} TurtleCoins`,
        `⭐ +${xp} XP`,
        avatarLabel
          ? `🎭 Nuovo avatar: ${avatarLabel}`
          : fallbackUsato
            ? `🎉 Avatar già tutti sbloccati: hai ricevuto monete bonus!`
            : '',
      ]
        .filter(Boolean)
        .join('\n'),
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
