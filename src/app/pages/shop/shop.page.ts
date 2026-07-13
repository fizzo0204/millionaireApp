import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController, IonicModule } from '@ionic/angular';
import { Observable, Subscription } from 'rxjs';
import {
  ChestCinematicComponent,
  ChestCinematicPhase,
} from 'src/app/components/chest-cinematic/chest-cinematic.component';

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
  imports: [IonicModule, CommonModule, ChestCinematicComponent],
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

  showPurchaseRewardCinematic = false;
  purchaseRewardCinematicPhase: ChestCinematicPhase = 'opening';

  readonly purchaseChestImage = 'assets/ui/epic-chest-reward.webp';
  readonly coinIconPath = 'assets/ui/coin-turtle.webp';

  purchaseRewardTitle = '';
  purchaseRewardIcon = this.coinIconPath;
  purchaseRewardLabel = '';
  purchaseRewardAvatarImage = '';
  purchaseRewardAvatarLabel = '';

  purchasePreview: AnteprimaForziere | null = null;
  purchaseAvatarRows: string[] = [];

  private purchaseConfirmResolver?: (value: boolean) => void;
  private previousLives?: number;

  readonly maxLives = 5;

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

  ngOnInit(): void {
    this.livesSub = this.lives$.subscribe((lives) => {
      if (this.previousLives !== undefined && lives > this.previousLives) {
        this.triggerLifePulse();
      }

      this.previousLives = lives;
    });
  }

  // Avvia il flusso di acquisto del forziere selezionato.
  async compraForziere(tipo: TipoForziere): Promise<void> {
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
        risultato.avatar?.icon,
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
  confermaAcquistoModale(): void {
    this.purchaseConfirmResolver?.(true);
    this.chiudiModaleAcquisto();
  }

  // Annulla l'acquisto dalla modale custom.
  annullaAcquistoModale(): void {
    this.purchaseConfirmResolver?.(false);
    this.chiudiModaleAcquisto();
  }

  // Chiude e pulisce la modale custom.
  private chiudiModaleAcquisto(): void {
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

  // Mostra la cinematica del premio ricevuto dopo l'acquisto.
  private async mostraPremioForziere(
    titolo: string,
    coins: number,
    xp: number,
    avatarLabel?: string,
    avatarImage?: string,
    fallbackUsato = false,
  ): Promise<void> {
    this.purchaseRewardTitle = titolo;
    this.purchaseRewardIcon = this.coinIconPath;

    this.purchaseRewardAvatarImage = avatarImage ?? '';
    this.purchaseRewardAvatarLabel = avatarLabel ?? '';

    const rewards = [`+${coins} TurtleCoins`, `+${xp} XP`];

    if (fallbackUsato) {
      rewards.push('Monete bonus per avatar già posseduti');
    }

    this.purchaseRewardLabel = rewards.join(' • ');
    this.purchaseRewardCinematicPhase = 'opening';
    this.showPurchaseRewardCinematic = true;

    await this.playPurchaseRewardCinematic();
  }

  // Gestisce le tre fasi della cinematica condivisa.
  private async playPurchaseRewardCinematic(): Promise<void> {
    await this.wait(1600);

    if (!this.showPurchaseRewardCinematic) return;

    this.purchaseRewardCinematicPhase = 'flash';

    await this.wait(650);

    if (!this.showPurchaseRewardCinematic) return;

    this.purchaseRewardCinematicPhase = 'reward';
  }

  // Chiude la cinematica e ripulisce tutti i dati del premio.
  closePurchaseRewardCinematic(): void {
    if (this.purchaseRewardCinematicPhase !== 'reward') return;

    this.showPurchaseRewardCinematic = false;
    this.purchaseRewardCinematicPhase = 'opening';

    this.purchaseRewardTitle = '';
    this.purchaseRewardIcon = this.coinIconPath;
    this.purchaseRewardLabel = '';
    this.purchaseRewardAvatarImage = '';
    this.purchaseRewardAvatarLabel = '';
  }

  // Mostra una modale generica in caso di errore acquisto.
  private async mostraErroreAcquisto(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Acquisto non completato',
      message:
        'Si è verificato un problema durante l’acquisto. Riprova tra poco.',
      buttons: ['Ok'],
      cssClass: 'shop-alert',
    });

    await alert.present();
  }

  async watchCoinsAd(): Promise<void> {
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

  triggerCoinPulse(): void {
    this.coinRewardPulse = true;

    setTimeout(() => {
      this.coinRewardPulse = false;
    }, 900);
  }

  async watchLifeAd(): Promise<void> {
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

  triggerLifePulse(): void {
    this.lifeRecoveredPulse = true;

    setTimeout(() => {
      this.lifeRecoveredPulse = false;
    }, 900);
  }

  ngOnDestroy(): void {
    this.livesSub?.unsubscribe();

    /*
     * Evitiamo di lasciare aperta una Promise se il componente viene
     * distrutto mentre la conferma dell'acquisto è ancora visibile.
     */
    this.purchaseConfirmResolver?.(false);
    this.purchaseConfirmResolver = undefined;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
