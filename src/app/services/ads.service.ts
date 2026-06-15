import { Injectable } from '@angular/core';
import {
  AdMob,
  BannerAdOptions,
  BannerAdSize,
  BannerAdPosition,
  RewardAdOptions,
  AdMobRewardItem,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { App } from '@capacitor/app';
import { AudioService } from './audio';
import { ADS_CONFIG } from '../config/ads.config';
import { PluginListenerHandle } from '@capacitor/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AdsService {
  private rewardedAdCompletedSubject = new Subject<void>();
  private bannerVisible = false;
  private bannerWanted = false;
  private bannerOperationId = 0;
  private adMobInitialized = false;
  private initializePromise?: Promise<boolean>;
  private rewardedAdInProgress = false;

  readonly rewardedAdCompleted$ =
    this.rewardedAdCompletedSubject.asObservable();

  constructor(private audioService: AudioService) {
    void this.initialize();
  }

  async initialize(): Promise<boolean> {
    if (this.adMobInitialized) return true;

    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = AdMob.initialize()
      .then(() => {
        this.adMobInitialized = true;
        return true;
      })
      .catch((error) => {
        console.warn('Errore inizializzazione AdMob:', error);
        return false;
      })
      .finally(() => {
        this.initializePromise = undefined;
      });

    return this.initializePromise;
  }

  async showBanner() {
    this.bannerWanted = true;
    const operationId = ++this.bannerOperationId;

    if (this.bannerVisible) return;

    const initialized = await this.initialize();

    if (!initialized) return;
    if (!this.bannerWanted || operationId !== this.bannerOperationId) return;

    const options: BannerAdOptions = {
      adId: ADS_CONFIG.banner.adId,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
    };

    try {
      await AdMob.showBanner(options);

      if (!this.bannerWanted || operationId !== this.bannerOperationId) {
        this.bannerVisible = true;
        await this.hideBanner();
        return;
      }

      this.bannerVisible = true;
    } catch (error) {
      if (operationId === this.bannerOperationId) {
        this.bannerVisible = false;
      }

      console.warn('Errore banner AdMob:', error);
    }
  }

  async hideBanner() {
    this.bannerWanted = false;
    const operationId = ++this.bannerOperationId;

    try {
      await AdMob.hideBanner();
    } catch (error) {
      console.warn('Errore hide banner AdMob:', error);
    } finally {
      if (operationId === this.bannerOperationId && !this.bannerWanted) {
        this.bannerVisible = false;
        return;
      }

      /*
       * Se un vecchio hide termina dopo una nuova richiesta show,
       * rimostriamo il banner per rispettare lo stato desiderato.
       */
      if (this.bannerWanted) {
        this.bannerVisible = false;
        void this.showBanner();
      }
    }
  }

  async showRewardedAd(): Promise<boolean> {
    if (this.rewardedAdInProgress) return false;

    this.rewardedAdInProgress = true;

    let hasReward = false;
    let finished = false;

    let rewardedListener: PluginListenerHandle | undefined;
    let dismissedListener: PluginListenerHandle | undefined;
    let failedListener: PluginListenerHandle | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = async () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }

      await rewardedListener?.remove();
      await dismissedListener?.remove();
      await failedListener?.remove();

      rewardedListener = undefined;
      dismissedListener = undefined;
      failedListener = undefined;
    };

    try {
      const initialized = await this.initialize();

      if (!initialized) return false;

      const options: RewardAdOptions = {
        adId: ADS_CONFIG.rewarded.adId,
      };

      await this.audioService.pauseMusic();

      const resultPromise = new Promise<boolean>(async (resolve) => {
        const finish = async (result: boolean) => {
          if (finished) return;

          finished = true;
          await cleanup();

          /*
           * Fix rewarded video: su alcuni device l'evento della reward arriva
           * mentre la pubblicita e ancora sopra l'app. Aspettiamo quindi che
           * l'app torni davvero attiva prima di far partire ruota, premi o UI.
           */
          await this.waitAppActiveAfterAd();
          await this.wait(350);
          await this.audioService.playMusic();

          if (result) {
            this.rewardedAdCompletedSubject.next();
          }

          resolve(result);
        };

        rewardedListener = await AdMob.addListener(
          RewardAdPluginEvents.Rewarded,
          async (reward: AdMobRewardItem) => {
            if (reward && reward.amount > 0) {
              hasReward = true;
            }
          },
        );

        dismissedListener = await AdMob.addListener(
          RewardAdPluginEvents.Dismissed,
          async () => {
            await finish(hasReward);
          },
        );

        failedListener = await AdMob.addListener(
          RewardAdPluginEvents.FailedToShow,
          async () => {
            await finish(false);
          },
        );

        timeout = setTimeout(() => {
          void finish(false);
        }, 60000);
      });

      await AdMob.prepareRewardVideoAd(options);
      await AdMob.showRewardVideoAd();

      return await resultPromise;
    } catch (err) {
      console.error('❌ Errore rewarded video:', err);
      await cleanup();
      await this.audioService.playMusic();
      return false;
    } finally {
      this.rewardedAdInProgress = false;
    }
  }

  // Aspetta che l'app sia tornata in foreground dopo la pubblicita.
  private async waitAppActiveAfterAd(): Promise<void> {
    const state = await App.getState().catch(() => ({ isActive: true }));

    if (state.isActive) return;

    await new Promise<void>(async (resolve) => {
      let listener: PluginListenerHandle | undefined;

      listener = await App.addListener(
        'appStateChange',
        async ({ isActive }) => {
          if (!isActive) return;

          await listener?.remove();
          resolve();
        },
      );
    });
  }

  // Utility interna per piccoli ritardi controllati dopo la chiusura dell'ad.
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
