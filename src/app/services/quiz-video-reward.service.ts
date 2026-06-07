import { Injectable, inject } from '@angular/core';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

@Injectable({
  providedIn: 'root',
})
export class QuizVideoRewardService {
  private ads = inject(AdsService);
  private coinsService = inject(CoinsService);
  private dailyEventsService = inject(DailyEventsService);
  private userStatsService = inject(UserStatsService);

  // Mostra un video rewarded e restituisce true solo se il reward è stato concesso.
  async guardaVideoReward(): Promise<boolean> {
    return await this.ads.showRewardedAd();
  }

  // Mostra un video e aggiunge TurtleCoins all'utente.
  async guardaVideoPerMonete(monete: number): Promise<boolean> {
    const reward = await this.guardaVideoReward();

    if (reward) {
      await this.coinsService.addCoins(monete);
    }

    return reward;
  }

  // Raddoppia il premio XP di un quiz normale dopo un video rewarded.
  async raddoppiaXpQuizNormale(
    userId: string,
    premioXpAttuale: number,
  ): Promise<number> {
    const reward = await this.guardaVideoReward();

    if (!reward || premioXpAttuale <= 0) return 0;

    await this.userStatsService.addXp(userId, premioXpAttuale);
    return premioXpAttuale;
  }

  // Raddoppia il premio della sfida giornaliera dopo un video rewarded.
  async raddoppiaPremioSfidaGiornaliera(): Promise<number> {
    const reward = await this.guardaVideoReward();

    if (!reward) return 0;

    return await this.dailyEventsService.doubleDailyChallengeReward();
  }
}
