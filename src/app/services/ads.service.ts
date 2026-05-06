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
      adId: 'ca-app-pub-3940256099942544/6300978111',
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

    let showedListener: any;
    let rewardedListener: any;
    let dismissedListener: any;

    try {
      const options: RewardAdOptions = {
        adId: 'ca-app-pub-3940256099942544/5224354917',
      };

      const dismissedPromise = new Promise<void>(async (resolve) => {
        showedListener = await AdMob.addListener(
          RewardAdPluginEvents.Showed,
          () => {
            this.audioService.pauseMusic();
          },
        );

        rewardedListener = await AdMob.addListener(
          RewardAdPluginEvents.Rewarded,
          (reward: AdMobRewardItem) => {
            if (reward && reward.amount > 0) {
              hasReward = true;
              console.log('🎉 Reward ottenuto:', reward);
            }
          },
        );

        dismissedListener = await AdMob.addListener(
          RewardAdPluginEvents.Dismissed,
          async () => {
            await this.audioService.playMusic();
            resolve();
          },
        );
      });

      await AdMob.prepareRewardVideoAd(options);
      await AdMob.showRewardVideoAd();

      await dismissedPromise;

      showedListener?.remove();
      rewardedListener?.remove();
      dismissedListener?.remove();

      return hasReward;
    } catch (err) {
      console.error('❌ Errore rewarded video:', err);

      showedListener?.remove();
      rewardedListener?.remove();
      dismissedListener?.remove();

      await this.audioService.playMusic();

      return false;
    }
  }
}
