import { Injectable } from '@angular/core';
import { HelpId } from 'src/app/models/help.model';
import { QuestionModel } from 'src/app/models/question.model';

export interface RisultatoCinquantaECinquanta {
  risposteDaNascondere: number[];
}

export interface StatoTimerQuiz {
  tempoRimasto: number;
  timerScaduto: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class QuizAiutiTimerService {
  private timer?: ReturnType<typeof setInterval>;

  // Restituisce true se l'aiuto richiesto è già stato utilizzato.
  aiutoGiaUsato(aiutiUsati: HelpId[], idAiuto: HelpId): boolean {
    return aiutiUsati.includes(idAiuto);
  }

  // Controlla se in questo momento l'utente può usare un aiuto.
  puoUsareAiuto(params: {
    idAiuto: HelpId;
    aiutiUsati: HelpId[];
    haRisposto: boolean;
    mostraModaleTempo: boolean;
    mostraModaleUscita: boolean;
    animazioneAiutoAttiva: boolean;
  }): boolean {
    return (
      !this.aiutoGiaUsato(params.aiutiUsati, params.idAiuto) &&
      !params.haRisposto &&
      !params.mostraModaleTempo &&
      !params.mostraModaleUscita &&
      !params.animazioneAiutoAttiva
    );
  }

  // Calcola quali risposte sbagliate nascondere per l'aiuto 50:50.
  calcolaCinquantaECinquanta(
    domanda: QuestionModel,
  ): RisultatoCinquantaECinquanta {
    const risposteSbagliate = domanda.answers
      .map((_, index: number) => index)
      .filter((index: number) => index !== domanda.correctIndex);

    return {
      risposteDaNascondere: risposteSbagliate.slice(0, 2),
    };
  }

  // Genera le percentuali mostrate nell'aiuto "Chiedi al pubblico".
  generaPercentualiPubblico(domanda: QuestionModel): number[] {
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
