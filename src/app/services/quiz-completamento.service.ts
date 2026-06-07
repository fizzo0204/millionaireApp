import { Injectable, inject } from '@angular/core';
import { User } from 'firebase/auth';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { ProgressService } from 'src/app/services/progress.service';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

export interface ParametriCompletamentoQuizNormale {
  user: User | null;
  categoryId: string;
  difficultyId: DifficultyId;
  levelNumber: number;
  displayLevelNumber: number;
  correctAnswers: number;
  totalQuestions: number;
  levelAlreadyCompleted: boolean;
  difficultyLevelNumbers: number[];
}

export interface RisultatoCompletamentoQuizNormale {
  completatoConPremio: boolean;
  levelAlreadyCompleted: boolean;
  rewardXp: number;
  rewardMessage: string;
  rewardUnlockedMessage: string;
}

@Injectable({
  providedIn: 'root',
})
export class QuizCompletamentoService {
  private dailyEventsService = inject(DailyEventsService);
  private progressService = inject(ProgressService);
  private userStatsService = inject(UserStatsService);

  // Completa un quiz normale: aggiorna statistiche, progressi, storico, eventi giornalieri e prepara il premio.
  async completaQuizNormale(
    params: ParametriCompletamentoQuizNormale,
  ): Promise<RisultatoCompletamentoQuizNormale> {
    const allQuestionsCorrect =
      params.totalQuestions > 0 &&
      params.correctAnswers === params.totalQuestions;

    if (!params.user) {
      return this.nessunPremio(params.levelAlreadyCompleted);
    }

    await this.tracciaQuizGiocato(allQuestionsCorrect);

    if (!allQuestionsCorrect || params.levelAlreadyCompleted) {
      return this.nessunPremio(params.levelAlreadyCompleted);
    }

    try {
      await this.userStatsService.recordQuizResult(
        params.user.uid,
        params.correctAnswers,
        params.totalQuestions,
      );

      await this.progressService.completeLevel(
        params.user.uid,
        params.categoryId,
        params.difficultyId,
        params.levelNumber,
      );

      await this.salvaStorico(params);
      await this.tracciaLivelloCompletato();
      await this.completaDifficoltaSeNecessario(params);

      return {
        completatoConPremio: true,
        levelAlreadyCompleted: true,
        rewardXp: params.correctAnswers * USER_STATS_CONFIG.xpPerCorrectAnswer,
        rewardMessage: `Hai completato il livello ${params.displayLevelNumber}!`,
        rewardUnlockedMessage: this.getRewardUnlockedMessage(
          params.levelNumber,
          params.difficultyLevelNumbers,
        ),
      };
    } catch (error) {
      console.error('Errore completamento quiz:', error);
      return this.nessunPremio(params.levelAlreadyCompleted);
    }
  }

  // Registra gli eventi giornalieri generici collegati al quiz normale.
  private async tracciaQuizGiocato(
    allQuestionsCorrect: boolean,
  ): Promise<void> {
    try {
      await this.dailyEventsService.trackNormalQuizPlayed();
    } catch (error) {
      console.warn('Daily event quiz played non salvato:', error);
    }

    if (!allQuestionsCorrect) return;

    try {
      await this.dailyEventsService.trackNormalQuizWon();
    } catch (error) {
      console.warn('Daily event quiz won non salvato:', error);
    }
  }

  // Salva lo storico del quiz senza bloccare il completamento se fallisce.
  private async salvaStorico(
    params: ParametriCompletamentoQuizNormale,
  ): Promise<void> {
    if (!params.user) return;

    try {
      await this.userStatsService.recordQuizHistory(
        params.user.uid,
        params.categoryId,
        params.difficultyId,
        params.correctAnswers,
        params.totalQuestions,
      );
    } catch (error) {
      console.warn('Storico quiz non salvato:', error);
    }
  }

  // Segna l'obiettivo giornaliero di livello completato senza bloccare il quiz se fallisce.
  private async tracciaLivelloCompletato(): Promise<void> {
    try {
      await this.dailyEventsService.trackNormalLevelCompleted();
    } catch (error) {
      console.warn('Daily event livello completato non salvato:', error);
    }
  }

  // Se l'utente ha completato l'ultimo livello della difficoltà, marca la difficoltà come completata.
  private async completaDifficoltaSeNecessario(
    params: ParametriCompletamentoQuizNormale,
  ): Promise<void> {
    if (!params.user || !this.isLastLevelInDifficulty(params)) return;

    const completedLevelNumbers =
      await this.progressService.getCompletedLevelNumbers(
        params.user.uid,
        params.categoryId,
        params.difficultyId,
      );

    const completedLevels = new Set(completedLevelNumbers);
    completedLevels.add(params.levelNumber);

    const difficultyCompleted =
      params.difficultyLevelNumbers.length > 0 &&
      params.difficultyLevelNumbers.every((levelNumber) =>
        completedLevels.has(levelNumber),
      );

    if (difficultyCompleted) {
      await this.progressService.completeUserDifficulty(
        params.user.uid,
        params.categoryId,
        params.difficultyId,
      );
    }
  }

  // Costruisce il messaggio di sblocco mostrato nella modale premio.
  private getRewardUnlockedMessage(
    levelNumber: number,
    difficultyLevelNumbers: number[],
  ): string {
    const currentLevelIndex = difficultyLevelNumbers.indexOf(levelNumber);
    const nextDisplayLevel = currentLevelIndex + 2;

    if (
      currentLevelIndex >= 0 &&
      nextDisplayLevel <= difficultyLevelNumbers.length
    ) {
      return `Livello ${nextDisplayLevel} sbloccato`;
    }

    return 'Difficolta completata';
  }

  // Verifica se il livello corrente è l'ultimo della difficoltà.
  private isLastLevelInDifficulty(
    params: ParametriCompletamentoQuizNormale,
  ): boolean {
    if (params.difficultyLevelNumbers.length === 0) return false;

    return (
      params.difficultyLevelNumbers[
        params.difficultyLevelNumbers.length - 1
      ] === params.levelNumber
    );
  }

  // Restituisce un risultato senza premio, mantenendo lo stato precedente del livello.
  private nessunPremio(
    levelAlreadyCompleted: boolean,
  ): RisultatoCompletamentoQuizNormale {
    return {
      completatoConPremio: false,
      levelAlreadyCompleted,
      rewardXp: 0,
      rewardMessage: '',
      rewardUnlockedMessage: '',
    };
  }
}
