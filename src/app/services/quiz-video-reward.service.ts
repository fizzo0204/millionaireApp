import { Injectable, inject } from '@angular/core';
import { AdsService } from 'src/app/services/ads.service';
import { CoinsService } from 'src/app/services/coins.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { DifficultyId } from 'src/app/models/difficulty.model';

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

  /*
   * Raddoppia il premio XP di un quiz normale dopo un video rewarded.
   * A differenza di ruota/sfida giornaliera, in precedenza qui non c'era
   * alcun controllo server-side "gia' raddoppiato": ci si fidava solo di un
   * booleano del componente. Ora il consumo passa da
   * raddoppiaXpLivelloCompletato, che usa completedLevels/{levelId} come
   * flag persistente e consumabile una sola volta per livello.
   */
  async raddoppiaXpQuizNormale(
    userId: string,
    categoryId: string,
    difficultyId: DifficultyId,
    levelNumber: number,
    premioXpAttuale: number,
  ): Promise<number> {
    const reward = await this.guardaVideoReward();

    if (!reward || premioXpAttuale <= 0) return 0;

    return this.userStatsService.raddoppiaXpLivelloCompletato(
      userId,
      categoryId,
      difficultyId,
      levelNumber,
      premioXpAttuale,
    );
  }

  // Raddoppia il premio della sfida giornaliera dopo un video rewarded.
  async raddoppiaPremioSfidaGiornaliera(): Promise<number> {
    const reward = await this.guardaVideoReward();

    if (!reward) return 0;

    return await this.dailyEventsService.doubleDailyChallengeReward();
  }
}
