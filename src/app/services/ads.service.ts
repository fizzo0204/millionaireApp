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
import { AudioService } from './audio';
import { ADS_CONFIG } from '../config/ads.config';
import { PluginListenerHandle } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class AdsService {
  private bannerVisible = false;
  private adMobInitialized = false;
  private initializePromise?: Promise<boolean>;

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
    if (this.bannerVisible) return;

    const initialized = await this.initialize();

    if (!initialized) return;

    const options: BannerAdOptions = {
      adId: ADS_CONFIG.banner.adId,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
    };

    try {
      await AdMob.showBanner(options);
      this.bannerVisible = true;
    } catch (error) {
      this.bannerVisible = false;
      console.warn('Errore banner AdMob:', error);
    }
  }

  async hideBanner() {
    try {
      await AdMob.hideBanner();
    } catch (error) {
      console.warn('Errore hide banner AdMob:', error);
    } finally {
      this.bannerVisible = false;
    }
  }

  async showRewardedAd(): Promise<boolean> {
    let hasReward = false;
    let adWasShown = false;
    let finished = false;

    let showedListener: PluginListenerHandle | undefined;
    let rewardedListener: PluginListenerHandle | undefined;
    let dismissedListener: PluginListenerHandle | undefined;
    let failedListener: PluginListenerHandle | undefined;
    let showTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const options: RewardAdOptions = {
        adId: ADS_CONFIG.rewarded.adId,
      };

      const resultPromise = new Promise<boolean>(async (resolve) => {
        const finish = async (result: boolean) => {
          if (finished) return;

          finished = true;

          if (showTimeout) {
            clearTimeout(showTimeout);
            showTimeout = undefined;
          }

          await this.audioService.playMusic();

          showedListener?.remove();
          rewardedListener?.remove();
          dismissedListener?.remove();
          failedListener?.remove();

          resolve(result);
        };

        showedListener = await AdMob.addListener(
          RewardAdPluginEvents.Showed,
          () => {
            adWasShown = true;

            if (showTimeout) {
              clearTimeout(showTimeout);
              showTimeout = undefined;
            }

            this.audioService.pauseMusic();
          },
        );

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

        showTimeout = setTimeout(() => {
          if (!adWasShown) {
            finish(false);
          }
        }, 30000);
      });

      await AdMob.prepareRewardVideoAd(options);
      await AdMob.showRewardVideoAd();

      return await resultPromise;
    } catch (err) {
      console.error('❌ Errore rewarded video:', err);

      if (showTimeout) {
        clearTimeout(showTimeout);
        showTimeout = undefined;
      }

      showedListener?.remove();
      rewardedListener?.remove();
      dismissedListener?.remove();
      failedListener?.remove();

      await this.audioService.playMusic();

      return false;
    }
  }
}
