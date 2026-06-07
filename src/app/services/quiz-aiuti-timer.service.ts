import { Injectable, inject } from '@angular/core';
import { HelpId, HelpModel } from 'src/app/models/help.model';
import { QuestionModel } from 'src/app/models/question.model';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { CoinsService } from 'src/app/services/coins.service';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { QuestionsService } from 'src/app/services/questions.service';
import { DAILY_EVENTS_CONFIG } from 'src/app/config/daily-events.config';

export type EsitoAiutoQuiz =
  | 'ok'
  | 'bloccato'
  | 'aiuto_non_trovato'
  | 'domanda_non_trovata'
  | 'monete_insufficienti'
  | 'pagamento_fallito'
  | 'nessuna_nuova_domanda';

export interface RisultatoAiutoQuiz {
  esito: EsitoAiutoQuiz;
  costoRichiesto?: number;
  risposteDaNascondere?: number[];
  percentualiPubblico?: number[];
  nuovaDomanda?: QuestionModel;
}

export interface ParametriUsoAiutoQuiz {
  idAiuto: HelpId;
  aiutiDisponibili: HelpModel[];
  aiutiUsati: HelpId[];
  domandaCorrente: QuestionModel | null;
  haRisposto: boolean;
  mostraModaleTempo: boolean;
  mostraModaleUscita: boolean;
  animazioneAiutoAttiva: boolean;
  modalitaSfidaGiornaliera: boolean;
  modalitaScalata: boolean;
  idCategoria: string;
  idDifficolta: DifficultyId;
  numeroLivello: number;
  numeroLivelloScalata: number;
  eseguiAnimazione: () => Promise<void>;
}

export interface ParametriCambioDomandaQuiz {
  modalitaSfidaGiornaliera: boolean;
  modalitaScalata: boolean;
  idCategoria: string;
  idDifficolta: DifficultyId;
  numeroLivello: number;
  numeroLivelloScalata: number;
}

export interface StatoTimerQuiz {
  tempoRimasto: number;
  timerScaduto: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class QuizAiutiTimerService {
  private coinsService = inject(CoinsService);
  private dailyEventsService = inject(DailyEventsService);
  private questionsService = inject(QuestionsService);

  private timer?: ReturnType<typeof setInterval>;

  // Gestisce tutto il flusso di utilizzo di un aiuto: controlli, costo, tracking, animazione e risultato finale.
  async usaAiuto(params: ParametriUsoAiutoQuiz): Promise<RisultatoAiutoQuiz> {
    if (!this.puoUsareAiuto(params)) {
      return { esito: 'bloccato' };
    }

    const aiuto = params.aiutiDisponibili.find(
      (item) => item.id === params.idAiuto,
    );

    if (!aiuto) {
      return { esito: 'aiuto_non_trovato' };
    }

    if (!params.domandaCorrente) {
      return { esito: 'domanda_non_trovata' };
    }

    if (!this.coinsService.canAfford(aiuto.cost)) {
      return {
        esito: 'monete_insufficienti',
        costoRichiesto: aiuto.cost,
      };
    }

    const pagamentoRiuscito = await this.coinsService.spendCoins(aiuto.cost);
    if (!pagamentoRiuscito) {
      return { esito: 'pagamento_fallito' };
    }

    this.tracciaAiutoUsato(params);
    await params.eseguiAnimazione();

    if (params.idAiuto === 'fifty') {
      return {
        esito: 'ok',
        risposteDaNascondere: this.calcolaCinquantaECinquanta(
          params.domandaCorrente,
        ),
      };
    }

    if (params.idAiuto === 'audience') {
      return {
        esito: 'ok',
        percentualiPubblico: this.generaPercentualiPubblico(
          params.domandaCorrente,
        ),
      };
    }

    if (params.idAiuto === 'switch') {
      const nuovaDomanda = await this.recuperaNuovaDomanda(params);

      if (!nuovaDomanda) {
        return { esito: 'nessuna_nuova_domanda' };
      }

      return {
        esito: 'ok',
        nuovaDomanda,
      };
    }

    return { esito: 'ok' };
  }

  // Recupera una nuova domanda rispettando la modalità attiva: quiz normale, sfida giornaliera o scalata.
  async recuperaNuovaDomanda(
    params: ParametriCambioDomandaQuiz,
  ): Promise<QuestionModel | null> {
    if (params.modalitaSfidaGiornaliera) {
      const [nuovaDomanda] =
        await this.questionsService.getRandomActiveQuestions(
          1,
          DAILY_EVENTS_CONFIG.dailyChallengeDifficulty,
        );

      return nuovaDomanda ?? null;
    }

    if (params.modalitaScalata) {
      const selection = await this.questionsService.getArcadeQuestionForLevel(
        params.numeroLivelloScalata,
      );

      return selection?.question ?? null;
    }

    const nuoveDomande = await this.questionsService.getQuestions(
      params.idCategoria,
      params.idDifficolta,
      params.numeroLivello,
      1,
    );

    return nuoveDomande[0] ?? null;
  }

  // Controlla se in questo momento l'utente può usare un aiuto.
  private puoUsareAiuto(params: ParametriUsoAiutoQuiz): boolean {
    return (
      !params.aiutiUsati.includes(params.idAiuto) &&
      !params.haRisposto &&
      !params.mostraModaleTempo &&
      !params.mostraModaleUscita &&
      !params.animazioneAiutoAttiva
    );
  }

  // Aggiorna gli obiettivi/eventi giornalieri collegati all'uso degli aiuti.
  private tracciaAiutoUsato(params: ParametriUsoAiutoQuiz): void {
    if (params.modalitaSfidaGiornaliera) {
      void this.dailyEventsService.trackDailyChallengeHelp();
      return;
    }

    if (!params.modalitaScalata) {
      void this.dailyEventsService.trackNormalHelpUsed();
    }
  }

  // Calcola quali risposte sbagliate nascondere per l'aiuto 50:50.
  private calcolaCinquantaECinquanta(domanda: QuestionModel): number[] {
    const risposteSbagliate = domanda.answers
      .map((_, index: number) => index)
      .filter((index: number) => index !== domanda.correctIndex);

    return risposteSbagliate.slice(0, 2);
  }

  // Genera le percentuali mostrate nell'aiuto "Chiedi al pubblico".
  private generaPercentualiPubblico(domanda: QuestionModel): number[] {
    const percentuali = [12, 18, 24, 16];
    percentuali[domanda.correctIndex] = 50;
    return percentuali;
  }

  // Calcola la percentuale grafica del timer circolare.
  calcolaPercentualeTimer(tempoRimasto: number, durataTotale: number): number {
    if (durataTotale <= 0) return 0;
    return Math.max(0, Math.min(100, (tempoRimasto / durataTotale) * 100));
  }

  // Avvia il countdown e chiama onTick ogni secondo.
  avviaTimer(params: {
    tempoIniziale: number;
    onTick: (stato: StatoTimerQuiz) => void;
    onScaduto: () => void;
  }): void {
    this.fermaTimer();

    let tempoRimasto = params.tempoIniziale;

    this.timer = setInterval(() => {
      tempoRimasto--;

      const timerScaduto = tempoRimasto <= 0;

      params.onTick({
        tempoRimasto: Math.max(0, tempoRimasto),
        timerScaduto,
      });

      if (timerScaduto) {
        this.fermaTimer();
        params.onScaduto();
      }
    }, 1000);
  }

  // Ferma il countdown attivo, se presente.
  fermaTimer(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = undefined;
  }

  // Indica se c'è un timer attualmente attivo.
  timerAttivo(): boolean {
    return !!this.timer;
  }
}
