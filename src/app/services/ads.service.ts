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

  constructor(private audioService: AudioService) {
    this.initialize();
  }

  async initialize() {
    await AdMob.initialize();
  }

  async showBanner() {
    if (this.bannerVisible) return;

    const options: BannerAdOptions = {
      adId: ADS_CONFIG.banner.adId,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
    };

    await AdMob.showBanner(options);
    this.bannerVisible = true;
  }

  async hideBanner() {
    await AdMob.hideBanner();
    this.bannerVisible = false;
  }

  async showRewardedAd(): Promise<boolean> {
    let hasReward = false;

    let showedListener: PluginListenerHandle | undefined;
    let rewardedListener: PluginListenerHandle | undefined;
    let dismissedListener: PluginListenerHandle | undefined;
    let failedListener: PluginListenerHandle | undefined;

    try {
      const options: RewardAdOptions = {
        adId: ADS_CONFIG.rewarded.adId,
      };

      const resultPromise = new Promise<boolean>(async (resolve) => {
        const finish = async (result: boolean) => {
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
      });

      await AdMob.prepareRewardVideoAd(options);
      await AdMob.showRewardVideoAd();

      return await resultPromise;
    } catch (err) {
      console.error('❌ Errore rewarded video:', err);

      showedListener?.remove();
      rewardedListener?.remove();
      dismissedListener?.remove();
      failedListener?.remove();

      await this.audioService.playMusic();

      return false;
    }
  }
}
