import { Injectable, inject } from '@angular/core';
import { User } from 'firebase/auth';
import { QuestionModel } from 'src/app/models/question.model';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { ARCADE_CONFIG } from 'src/app/config/arcade.config';
import { QuestionsService } from 'src/app/services/questions.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

export interface DomandaScalataQuiz {
  domanda: QuestionModel;
  livelloScalata: number;
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

export interface RisultatoCompletamentoScalata {
  livelloSuccessivo: number;
  premio: PremioScalataQuiz;
}

@Injectable({
  providedIn: 'root',
})
export class QuizScalataService {
  private questionsService = inject(QuestionsService);
  private userStatsService = inject(UserStatsService);

  // Recupera la domanda corretta per il livello corrente della Scalata.
  async recuperaDomandaScalata(
    user: User | null,
  ): Promise<DomandaScalataQuiz | null> {
    const arcade = user
      ? await this.userStatsService.getArcadeData(user.uid)
      : this.userStatsService.defaultArcade;

    const selection = await this.questionsService.getArcadeQuestionForLevel(
      arcade.currentLevel,
    );

    if (!selection) return null;

    return {
      domanda: selection.question,
      livelloScalata: selection.arcadeLevel,
      totaleLivelli: selection.totalLevels,
      idDifficolta: selection.difficultyId,
      numeroLivello: selection.levelNumber,
    };
  }

  // Restituisce il numero totale di livelli configurati per la Scalata.
  async recuperaTotaleLivelliScalata(): Promise<number> {
    return await this.questionsService.getArcadeTotalLevels();
  }

  // Registra un errore nella Scalata, usato quando il giocatore perde o abbandona il livello.
  async registraErroreScalata(user: User | null): Promise<void> {
    if (!user) return;
    await this.userStatsService.recordArcadeMistake(user.uid);
  }

  // Completa un livello della Scalata e restituisce premio e livello successivo.
  async completaLivelloScalata(
    user: User | null,
    livelloScalata: number,
  ): Promise<RisultatoCompletamentoScalata | null> {
    if (!user) return null;

    const premio = this.calcolaPremioScalata(livelloScalata);
    const updatedArcade =
      await this.userStatsService.recordArcadeLevelCompleted(
        user.uid,
        livelloScalata,
        premio.totalCoins,
        premio.totalXp,
      );

    if (!updatedArcade) return null;

    return {
      livelloSuccessivo: updatedArcade.currentLevel,
      premio,
    };
  }

  // Calcola premio base e bonus forziere della Scalata.
  calcolaPremioScalata(arcadeLevel: number): PremioScalataQuiz {
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
