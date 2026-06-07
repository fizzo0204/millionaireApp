import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdsService } from 'src/app/services/ads.service';
import { AuthService } from 'src/app/services/auth.service';
import { CoinsService } from 'src/app/services/coins.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

export interface RisultatoRaddoppioXp {
  riuscito: boolean;
  bonusXp: number;
}

export interface RisultatoRaddoppioSfidaGiornaliera {
  riuscito: boolean;
  bonusCoins: number;
}

@Injectable({
  providedIn: 'root',
})
export class QuizVideoRewardService {
  private ads = inject(AdsService);
  private auth = inject(AuthService);
  private coinsService = inject(CoinsService);
  private dailyEventsService = inject(DailyEventsService);
  private userStatsService = inject(UserStatsService);

  // Mostra un video reward e restituisce true solo se il premio è stato ottenuto.
  async mostraVideoReward(): Promise<boolean> {
    return !!(await this.ads.showRewardedAd());
  }

  // Mostra un video reward e aggiunge monete all'utente se il video viene completato.
  async aggiungiMoneteDaVideo(monete: number): Promise<boolean> {
    const reward = await this.mostraVideoReward();

    if (!reward) return false;

    await this.coinsService.addCoins(monete);
    return true;
  }

  // Raddoppia il premio XP del quiz normale dopo un video reward completato.
  async raddoppiaPremioXp(premioXp: number): Promise<RisultatoRaddoppioXp> {
    if (premioXp <= 0) {
      return { riuscito: false, bonusXp: 0 };
    }

    const reward = await this.mostraVideoReward();
    if (!reward) return { riuscito: false, bonusXp: 0 };

    const user = await firstValueFrom(this.auth.user$);
    if (!user) return { riuscito: false, bonusXp: 0 };

    await this.userStatsService.addXp(user.uid, premioXp);

    return { riuscito: true, bonusXp: premioXp };
  }

  // Raddoppia il premio della Sfida Daily dopo un video reward completato.
  async raddoppiaPremioSfidaGiornaliera(): Promise<RisultatoRaddoppioSfidaGiornaliera> {
    const reward = await this.mostraVideoReward();
    if (!reward) return { riuscito: false, bonusCoins: 0 };

    const bonusCoins =
      await this.dailyEventsService.doubleDailyChallengeReward();

    return {
      riuscito: bonusCoins > 0,
      bonusCoins: Math.max(0, bonusCoins),
    };
  }
}
