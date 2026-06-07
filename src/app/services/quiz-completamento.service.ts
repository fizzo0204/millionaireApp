import { Injectable, inject } from '@angular/core';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { ProgressService } from 'src/app/services/progress.service';
import { UserStatsService } from 'src/app/services/user-stats.service';

export type EsitoCompletamentoQuizNormale = 'premio' | 'uscita';

export interface ParametriCompletamentoQuizNormale {
  userId?: string;
  idCategoria: string;
  idDifficolta: DifficultyId;
  numeroLivello: number;
  risposteCorrette: number;
  totaleDomande: number;
  livelloGiaCompletato: boolean;
  numeriLivelliDifficolta: number[];
}

export interface RisultatoCompletamentoQuizNormale {
  esito: EsitoCompletamentoQuizNormale;
  premioXp: number;
  livelloCompletato: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class QuizCompletamentoService {
  private dailyEventsService = inject(DailyEventsService);
  private progressService = inject(ProgressService);
  private userStatsService = inject(UserStatsService);

  // Completa un quiz normale: salva statistiche, progresso livello, storico e obiettivi giornalieri.
  async completaQuizNormale(
    params: ParametriCompletamentoQuizNormale,
  ): Promise<RisultatoCompletamentoQuizNormale> {
    const tuttoCorretto =
      params.totaleDomande > 0 &&
      params.risposteCorrette === params.totaleDomande;

    if (!params.userId) {
      return this.risultatoUscita(params.livelloGiaCompletato);
    }

    await this.tracciaQuizNormaleGiocato(tuttoCorretto);

    if (!tuttoCorretto || params.livelloGiaCompletato) {
      return this.risultatoUscita(params.livelloGiaCompletato);
    }

    try {
      await this.salvaCompletamentoLivello(params);
      await this.completaDifficoltaSeNecessario(params);

      return {
        esito: 'premio',
        premioXp:
          params.risposteCorrette * USER_STATS_CONFIG.xpPerCorrectAnswer,
        livelloCompletato: true,
      };
    } catch (error) {
      console.error('Errore completamento quiz:', error);
      return this.risultatoUscita(params.livelloGiaCompletato);
    }
  }

  // Registra gli eventi giornalieri collegati al quiz normale.
  private async tracciaQuizNormaleGiocato(
    tuttoCorretto: boolean,
  ): Promise<void> {
    try {
      await this.dailyEventsService.trackNormalQuizPlayed();
    } catch (error) {
      console.warn('Daily event quiz played non salvato:', error);
    }

    if (!tuttoCorretto) return;

    try {
      await this.dailyEventsService.trackNormalQuizWon();
    } catch (error) {
      console.warn('Daily event quiz won non salvato:', error);
    }
  }

  // Salva statistiche, livello completato, storico quiz e obiettivo giornaliero del livello.
  private async salvaCompletamentoLivello(
    params: ParametriCompletamentoQuizNormale,
  ): Promise<void> {
    if (!params.userId) return;

    await this.userStatsService.recordQuizResult(
      params.userId,
      params.risposteCorrette,
      params.totaleDomande,
    );

    await this.progressService.completeLevel(
      params.userId,
      params.idCategoria,
      params.idDifficolta,
      params.numeroLivello,
    );

    try {
      await this.userStatsService.recordQuizHistory(
        params.userId,
        params.idCategoria,
        params.idDifficolta,
        params.risposteCorrette,
        params.totaleDomande,
      );
    } catch (error) {
      console.warn('Storico quiz non salvato:', error);
    }

    try {
      await this.dailyEventsService.trackNormalLevelCompleted();
    } catch (error) {
      console.warn('Daily event livello completato non salvato:', error);
    }
  }

  // Se l'utente ha completato tutti i livelli della difficoltà, marca la difficoltà come completata.
  private async completaDifficoltaSeNecessario(
    params: ParametriCompletamentoQuizNormale,
  ): Promise<void> {
    if (!params.userId || !this.eUltimoLivelloDellaDifficolta(params)) return;

    const completedLevelNumbers =
      await this.progressService.getCompletedLevelNumbers(
        params.userId,
        params.idCategoria,
        params.idDifficolta,
      );

    const completedLevels = new Set(completedLevelNumbers);
    completedLevels.add(params.numeroLivello);

    const difficoltaCompletata =
      params.numeriLivelliDifficolta.length > 0 &&
      params.numeriLivelliDifficolta.every((numeroLivello) =>
        completedLevels.has(numeroLivello),
      );

    if (!difficoltaCompletata) return;

    await this.progressService.completeUserDifficulty(
      params.userId,
      params.idCategoria,
      params.idDifficolta,
    );
  }

  // Controlla se il livello corrente è l'ultimo livello della difficoltà.
  private eUltimoLivelloDellaDifficolta(
    params: ParametriCompletamentoQuizNormale,
  ): boolean {
    if (!params.numeriLivelliDifficolta.length) return false;

    return (
      params.numeroLivello ===
      params.numeriLivelliDifficolta[params.numeriLivelliDifficolta.length - 1]
    );
  }

  // Restituisce il risultato standard quando il quiz deve semplicemente uscire senza premio.
  private risultatoUscita(
    livelloGiaCompletato: boolean,
  ): RisultatoCompletamentoQuizNormale {
    return {
      esito: 'uscita',
      premioXp: 0,
      livelloCompletato: livelloGiaCompletato,
    };
  }
}
