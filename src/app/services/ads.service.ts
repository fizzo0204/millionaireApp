import { Injectable } from '@angular/core';
import {
  AdMob,
  BannerAdOptions,
  BannerAdSize,
  BannerAdPosition,
  RewardAdOptions,
  AdMobRewardItem,
} from '@capacitor-community/admob';

@Injectable({
  providedIn: 'root',
})
export class AdsService {
  private bannerVisible = false;

  constructor() {
    this.initialize();
  }

  async initialize() {
    await AdMob.initialize();
  }

  /** --------------------
   *  BANNER
   * -------------------- */
  async showBanner() {
    if (this.bannerVisible) return;

    const options: BannerAdOptions = {
      adId: 'ca-app-pub-3940256099942544/6300978111', // TEST BANNER
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

  /** --------------------
   *  REWARDED VIDEO
   * -------------------- */
  async showRewardedAd(): Promise<boolean> {
    try {
      const options: RewardAdOptions = {
        adId: 'ca-app-pub-3940256099942544/5224354917', // TEST REWARDED
      };

      // 1️⃣ Prepariamo il video (QUI mettiamo l'adId)
      await AdMob.prepareRewardVideoAd(options);

      // 2️⃣ Mostriamo il video (senza parametri)
      const reward: AdMobRewardItem = await AdMob.showRewardVideoAd();

      // reward → { amount: number, type: string }
      if (reward && reward.amount > 0) {
        console.log('🎉 Reward ottenuto:', reward);
        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ Errore rewarded video:', err);
      return false;
    }
  }
}
