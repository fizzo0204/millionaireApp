import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { QuestionModel } from 'src/app/models/question.model';
import { ARCADE_CONFIG } from 'src/app/config/arcade.config';
import { AuthService } from 'src/app/services/auth.service';
import { LivesService } from 'src/app/services/lives';
import { QuestionsService } from 'src/app/services/questions.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

export interface EtichetteScalataQuiz {
  idCategoria: string;
  titoloCategoria: string;
  iconaCategoria: string;
  idDifficolta: DifficultyId;
  titoloDifficolta: string;
  numeroLivello: number;
  numeroLivelloVisualizzato: number;
  totaleLivelli: number;
}

export interface RisultatoDomandaScalataQuiz {
  domanda: QuestionModel | null;
  numeroLivelloVisualizzato: number;
  totaleLivelli: number;
  idDifficolta: DifficultyId;
  numeroLivello: number;
}

export interface PremioScalataQuiz {
  baseCoins: number;
  baseXp: number;
  bonusCoins: number;
  bonusXp: number;
  totalCoins: number;
  totalXp: number;
  hasBonus: boolean;
}

export interface RisultatoConclusioneScalataQuiz {
  success: boolean;
  prossimoLivello?: number;
  reward?: PremioScalataQuiz;
}

@Injectable({
  providedIn: 'root',
})
export class QuizScalataService {
  private auth = inject(AuthService);
  private livesService = inject(LivesService);
  private questionsService = inject(QuestionsService);
  private userStatsService = inject(UserStatsService);

  // Prepara le etichette iniziali della modalità Scalata.
  async configuraEtichetteScalata(): Promise<EtichetteScalataQuiz> {
    return {
      idCategoria: 'arcade',
      titoloCategoria: 'Scalata',
      iconaCategoria: '⚡',
      idDifficolta: 'easy',
      titoloDifficolta: 'Progressiva',
      numeroLivello: 1,
      numeroLivelloVisualizzato: 1,
      totaleLivelli: await this.questionsService.getArcadeTotalLevels(),
    };
  }

  // Recupera la domanda corretta per il livello corrente della Scalata.
  async recuperaDomandaScalata(): Promise<RisultatoDomandaScalataQuiz> {
    const user = await firstValueFrom(this.auth.user$);
    const arcade = user
      ? await this.userStatsService.getArcadeData(user.uid)
      : this.userStatsService.defaultArcade;

    const selection = await this.questionsService.getArcadeQuestionForLevel(
      arcade.currentLevel,
    );

    if (!selection) {
      return {
        domanda: null,
        numeroLivelloVisualizzato: arcade.currentLevel,
        totaleLivelli: await this.questionsService.getArcadeTotalLevels(),
        idDifficolta: 'easy',
        numeroLivello: 1,
      };
    }

    return {
      domanda: selection.question,
      numeroLivelloVisualizzato: selection.arcadeLevel,
      totaleLivelli: selection.totalLevels,
      idDifficolta: selection.difficultyId,
      numeroLivello: selection.levelNumber,
    };
  }

  // Registra un errore nella Scalata e consuma una vita.
  async registraErroreScalata(): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);

    if (user) {
      await this.userStatsService.recordArcadeMistake(user.uid);
    }

    await this.livesService.spendLife();
  }

  // Registra il completamento del livello Scalata e restituisce premio e livello successivo.
  async concludiLivelloScalata(
    numeroLivelloVisualizzato: number,
  ): Promise<RisultatoConclusioneScalataQuiz> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      return { success: false };
    }

    const reward = this.calcolaPremioScalata(numeroLivelloVisualizzato);
    const updatedArcade =
      await this.userStatsService.recordArcadeLevelCompleted(
        user.uid,
        numeroLivelloVisualizzato,
        reward.totalCoins,
        reward.totalXp,
      );

    if (!updatedArcade) {
      return { success: false };
    }

    return {
      success: true,
      prossimoLivello: updatedArcade.currentLevel,
      reward,
    };
  }

  // Calcola monete, XP e bonus forziere della Scalata.
  private calcolaPremioScalata(arcadeLevel: number): PremioScalataQuiz {
    const hasBonus = arcadeLevel % ARCADE_CONFIG.bonusEveryLevels === 0;
    const bonusCoins = hasBonus ? ARCADE_CONFIG.bonusCoins : 0;
    const bonusXp = hasBonus ? ARCADE_CONFIG.bonusXp : 0;

    return {
      baseCoins: ARCADE_CONFIG.baseCoinsPerLevel,
      baseXp: ARCADE_CONFIG.baseXpPerLevel,
      bonusCoins,
      bonusXp,
      totalCoins: ARCADE_CONFIG.baseCoinsPerLevel + bonusCoins,
      totalXp: ARCADE_CONFIG.baseXpPerLevel + bonusXp,
      hasBonus,
    };
  }
}
