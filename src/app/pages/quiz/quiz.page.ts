import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { ProgressService } from 'src/app/services/progress.service';
import { QuestionsService } from 'src/app/services/questions.service';
import { QuestionModel } from 'src/app/models/question.model';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import { GameLoaderComponent } from 'src/app/components/game-loader/game-loader.component';
import { AuthService } from 'src/app/services/auth.service';
import { firstValueFrom } from 'rxjs';
import { HapticsService } from 'src/app/services/haptics.service';
import { HelpModel, HelpId } from 'src/app/models/help.model';
import { HELPS } from 'src/app/data/helps.data';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { AudioService } from 'src/app/services/audio';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { DAILY_EVENTS_CONFIG } from 'src/app/config/daily-events.config';
import { ARCADE_CONFIG } from 'src/app/config/arcade.config';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';
import { QuizAiutiTimerService } from 'src/app/services/quiz-aiuti-timer.service';
import { QuizCompletamentoService } from 'src/app/services/quiz-completamento.service';
import { QuizVideoRewardService } from 'src/app/services/quiz-video-reward.service';

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule, IonicModule, GameLoaderComponent],
  templateUrl: './quiz.page.html',
  styleUrls: ['./quiz.page.scss'],
})
export class QuizPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private questionsService = inject(QuestionsService);
  private coinsService = inject(CoinsService);
  private livesService = inject(LivesService);
  private progressService = inject(ProgressService);
  private userStatsService = inject(UserStatsService);
  private auth = inject(AuthService);
  private haptics = inject(HapticsService);
  private audioService = inject(AudioService);
  private dailyEventsService = inject(DailyEventsService);
  private navigation = inject(NavigationTransitionService);
  private quizAiutiTimerService = inject(QuizAiutiTimerService);
  private quizCompletamentoService = inject(QuizCompletamentoService);
  private quizVideoRewardService = inject(QuizVideoRewardService);

  private appStateListener?: PluginListenerHandle;

  private adInProgress = false;
  private lifeLostForLeaving = false;
  private navigatingAway = false;
  livelloGiaCompletato = false;
  raddoppioPremioInCaricamento = false;
  premioRaddoppiato = false;
  modalitaSfidaGiornaliera = false;
  modalitaScalata = false;
  premioMoneteSfidaGiornaliera = 0;
  premioSfidaGiornalieraGiaRiscosso = false;
  premioMoneteScalata = 0;
  premioXpScalata = 0;
  premioMoneteForziereScalata = 0;
  premioXpForziereScalata = 0;
  premioScalataHaBonus = false;
  transizioneScalataVisibile = false;
  transizioneScalataPronta = false;
  transizioneScalataDa = 1;
  transizioneScalataA = 2;
  mostraModaleForziereScalata = false;

  idDifficolta: DifficultyId = 'easy';
  titoloCategoria = 'Quiz';
  iconaCategoria = '❓';
  titoloDifficolta = 'Easy';
  idCategoria = '';
  messaggioPremio = '';
  messaggioSbloccoPremio = '';

  tempoRimasto = 15;
  readonly tempoMassimo = 15;
  percentualiPubblico = [15, 20, 50, 15];
  numeroLivello = 1;
  numeroLivelloVisualizzato = 1;
  totaleLivelli = 0;
  numeriLivelliDifficolta: number[] = [];
  indiceCorrente = 0;
  risposteCorrette = 0;
  risposteSbagliate = 0;
  premioXp = 0;
  readonly xpPerDomanda = USER_STATS_CONFIG.xpPerCorrectAnswer;
  moneteNecessarie = 0;
  indiceRispostaSelezionata: number | null = null;
  risposteNascoste: number[] = [];

  domande: QuestionModel[] = [];
  aiutiUsati: HelpId[] = [];
  animazioneAiuto: HelpId | null = null;

  caricamento = true;
  haRisposto = false;
  rispostaCorretta = false;
  mostraModaleErrore = false;
  mostraModaleTempo = false;
  mostraModaleMonete = false;
  mostraSuggerimentoPubblico = false;
  mostraModaleUscita = false;
  mostraModalePremio = false;
  cambioDomandaInCorso = false;

  monete$ = this.coinsService.coins$;
  vite$ = this.livesService.lives$;

  private trackedDailyQuestionIndexes = new Set<number>();

  aiuti: HelpModel[] = [...HELPS];

  // Inizializza la pagina scegliendo la modalità corretta e caricando la prima domanda.
  async ngOnInit() {
    this.audioService.suspendMusicForGame();

    const cleanUrl = this.router.url.split('?')[0];

    this.modalitaSfidaGiornaliera = cleanUrl.startsWith('/daily-challenge');
    this.modalitaScalata = cleanUrl.startsWith('/arcade/play');

    if (this.modalitaSfidaGiornaliera) {
      this.configuraEtichetteSfidaGiornaliera();
      await this.dailyEventsService.trackDailyChallengeStarted();
    } else if (this.modalitaScalata) {
      await this.configuraEtichetteScalata();
    } else {
      this.idCategoria = this.route.snapshot.paramMap.get('categoryId') || '';
      this.idDifficolta =
        (this.route.snapshot.paramMap.get('difficultyId') as DifficultyId) ||
        'easy';
      this.numeroLivello = Number(
        this.route.snapshot.paramMap.get('levelNumber') || 1,
      );

      this.configuraEtichette();
      await this.configuraProgressoLivello();
    }

    await this.listenToAppState();
    await this.caricaDomande();
  }

  // Quando la pagina rientra in vista, sospende la musica generale del gioco.
  ionViewWillEnter() {
    this.audioService.suspendMusicForGame();
  }

  // Recupera i livelli disponibili e controlla se il livello attuale è già stato completato.
  private async configuraProgressoLivello() {
    const user = await firstValueFrom(this.auth.user$);

    const [numeriLivelliDifficolta, livelloGiaCompletato] = await Promise.all([
      this.questionsService.getDifficultyLevelNumbers(
        this.idCategoria,
        this.idDifficolta,
      ),
      user
        ? this.progressService.isLevelCompleted(
            user.uid,
            this.idCategoria,
            this.idDifficolta,
            this.numeroLivello,
          )
        : Promise.resolve(false),
    ]);

    this.numeriLivelliDifficolta = numeriLivelliDifficolta;
    this.livelloGiaCompletato = livelloGiaCompletato;

    const currentLevelIndex = this.numeriLivelliDifficolta.indexOf(
      this.numeroLivello,
    );

    this.totaleLivelli = this.numeriLivelliDifficolta.length;
    this.numeroLivelloVisualizzato =
      currentLevelIndex >= 0 ? currentLevelIndex + 1 : this.numeroLivello;
  }

  // Quando si lascia la pagina, ferma timer e suoni del quiz.
  ionViewWillLeave() {
    this.fermaTimer();
    void this.audioService.resumeMusicAfterGame();
  }

  // Carica le domande della modalità corrente e prepara lo stato iniziale del quiz.
  async caricaDomande() {
    this.caricamento = true;

    const questionsPromise = this.recuperaDomandeModalitaCorrente();
    const minLoaderMs = this.modalitaScalata
      ? 360
      : this.modalitaSfidaGiornaliera
        ? 520
        : 650;

    const [domande] = await Promise.all([
      questionsPromise,
      this.wait(minLoaderMs),
    ]);

    this.domande = domande;
    this.trackedDailyQuestionIndexes.clear();

    this.caricamento = false;

    this.indiceCorrente = 0;
    this.risposteCorrette = 0;
    this.risposteSbagliate = 0;

    if (this.domande.length === 0) {
      this.fermaTimer();
      return;
    }

    this.avviaDomandaCorrente();
  }

  // Decide da quale sorgente prendere le domande in base alla modalità attiva.
  private async recuperaDomandeModalitaCorrente(): Promise<QuestionModel[]> {
    if (this.modalitaSfidaGiornaliera) {
      return this.questionsService.getRandomActiveQuestions(
        DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount,
        DAILY_EVENTS_CONFIG.dailyChallengeDifficulty,
      );
    }

    if (this.modalitaScalata) {
      return this.recuperaDomandaScalata();
    }

    return this.questionsService.getQuestions(
      this.idCategoria,
      this.idDifficolta,
      this.numeroLivello,
      1,
    );
  }

  // Recupera una singola domanda adatta al livello corrente della Scalata.
  private async recuperaDomandaScalata(): Promise<QuestionModel[]> {
    const user = await firstValueFrom(this.auth.user$);
    const arcade = user
      ? await this.userStatsService.getArcadeData(user.uid)
      : this.userStatsService.defaultArcade;

    const selection = await this.questionsService.getArcadeQuestionForLevel(
      arcade.currentLevel,
    );

    if (!selection) {
      this.numeroLivelloVisualizzato = arcade.currentLevel;
      this.totaleLivelli = await this.questionsService.getArcadeTotalLevels();
      return [];
    }

    this.numeroLivelloVisualizzato = selection.arcadeLevel;
    this.totaleLivelli = selection.totalLevels;
    this.idDifficolta = selection.difficultyId;
    this.numeroLivello = selection.levelNumber;
    this.titoloDifficolta = this.recuperaTitoloDifficolta(
      selection.difficultyId,
    );

    return [selection.question];
  }

  // Piccola attesa usata per animazioni e loader.
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Ascolta quando l’app va in background per gestire eventuali abbandoni.
  private async listenToAppState() {
    this.appStateListener = await CapacitorApp.addListener(
      'appStateChange',
      async ({ isActive }) => {
        if (!isActive) {
          await this.handleAppBackgrounded();
        }
      },
    );
  }

  // Se l’utente esce dall’app durante una domanda attiva, applica la penalità prevista.
  private async handleAppBackgrounded() {
    if (this.adInProgress) return;
    if (this.lifeLostForLeaving) return;
    if (this.navigatingAway) return;
    if (this.caricamento || !this.domandaCorrente) return;

    const isInsideActiveQuestion =
      !this.haRisposto || this.mostraModaleTempo || this.mostraModaleUscita;

    if (!isInsideActiveQuestion) return;

    this.lifeLostForLeaving = true;
    this.navigatingAway = true;

    await this.livesService.spendLife();

    this.fermaTimer();
    this.vaiAllaPaginaDiUscita();
  }

  // Imposta titolo, icona e difficoltà per il quiz normale.
  configuraEtichette() {
    const categories: Record<string, { title: string; icon: string }> = {
      sport: { title: 'Sport', icon: '⚽' },
      cinema: { title: 'Cinema', icon: '🎬' },
      storia: { title: 'Storia', icon: '🏛️' },
      geografia: { title: 'Geografia', icon: '🌍' },
      scienza: { title: 'Scienze', icon: '🔬' },
      musica: { title: 'Musica', icon: '🎵' },
      tecnologia: { title: 'Tecnologia', icon: '💡' },
      altro: { title: 'Altro', icon: '⭐' },
    };

    this.titoloCategoria = categories[this.idCategoria]?.title || 'Quiz';
    this.iconaCategoria = categories[this.idCategoria]?.icon || '❓';
    this.titoloDifficolta = this.recuperaTitoloDifficolta(this.idDifficolta);
  }

  // Imposta le etichette e i contatori della Sfida Daily.
  configuraEtichetteSfidaGiornaliera() {
    this.idCategoria = 'daily';
    this.titoloCategoria = 'Sfida Daily';
    this.iconaCategoria = '';
    this.titoloDifficolta = 'Random';
    this.numeroLivello = 1;
    this.numeroLivelloVisualizzato = 1;
    this.totaleLivelli = DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount;
  }

  // Imposta le etichette e i contatori della modalità Scalata.
  private async configuraEtichetteScalata() {
    this.idCategoria = 'arcade';
    this.titoloCategoria = 'Scalata';
    this.iconaCategoria = '⚡';
    this.idDifficolta = 'easy';
    this.titoloDifficolta = 'Progressiva';
    this.numeroLivello = 1;
    this.numeroLivelloVisualizzato = 1;
    this.totaleLivelli = await this.questionsService.getArcadeTotalLevels();
  }

  // Converte l’id difficoltà nel testo mostrato a schermo.
  private recuperaTitoloDifficolta(idDifficolta: DifficultyId): string {
    const difficulties: Record<DifficultyId, string> = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      extreme: 'Extreme',
    };

    return difficulties[idDifficolta] || 'Easy';
  }

  // Restituisce la domanda attualmente visualizzata.
  get domandaCorrente(): QuestionModel | null {
    return this.domande[this.indiceCorrente] || null;
  }

  // Calcola la percentuale della barra di progresso.
  get percentualeProgresso(): number {
    if (!this.domande.length) return 0;

    if (this.modalitaScalata) {
      const stepInBonus =
        ((this.numeroLivelloVisualizzato - 1) %
          ARCADE_CONFIG.bonusEveryLevels) +
        1;

      return (stepInBonus / ARCADE_CONFIG.bonusEveryLevels) * 100;
    }

    return ((this.indiceCorrente + 1) / this.domande.length) * 100;
  }

  // Testo mostrato sopra la barra di progresso.
  get etichettaProgressoDomanda(): string {
    if (this.modalitaScalata) {
      return `Livello Scalata ${this.numeroLivelloVisualizzato}/${this.totaleLivelli}`;
    }

    if (this.modalitaSfidaGiornaliera) {
      return `Domanda ${this.indiceCorrente + 1}/${this.domande.length}`;
    }

    return `Domanda ${this.numeroLivelloVisualizzato}/${this.totaleLivelli}`;
  }

  // Testo del piccolo premio mostrato dopo una risposta corretta.
  get etichettaPremioCorretto(): string {
    if (this.modalitaScalata) {
      return `+${ARCADE_CONFIG.baseXpPerLevel} XP +${ARCADE_CONFIG.baseCoinsPerLevel}`;
    }

    return `+${this.xpPerDomanda} XP`;
  }

  // Calcola la percentuale del timer circolare.
  get percentualeTimer(): number {
    return this.quizAiutiTimerService.calcolaPercentualeTimer(
      this.tempoRimasto,
      this.tempoMassimo,
    );
  }

  // Lettere visualizzate accanto alle risposte.
  get lettereRisposte() {
    return ['A', 'B', 'C', 'D'];
  }

  // Gestisce il tap su una risposta e decide se è corretta o sbagliata.
  selezionaRisposta(index: number) {
    if (
      this.haRisposto ||
      this.risposteNascoste.includes(index) ||
      this.mostraModaleUscita ||
      this.mostraModaleTempo
    ) {
      return;
    }

    const question = this.domandaCorrente;
    if (!question) return;

    this.indiceRispostaSelezionata = index;
    this.haRisposto = true;
    this.rispostaCorretta = index === question.correctIndex;

    this.fermaTimer();

    if (this.rispostaCorretta) {
      this.risposteCorrette++;
      this.haptics.success();
      this.audioService.playCorrectQuiz();

      if (this.modalitaSfidaGiornaliera) {
        void this.dailyEventsService.trackDailyChallengeCorrect();
      }

      setTimeout(() => {
        this.prossimaDomanda();
      }, 700);

      return;
    }

    this.risposteSbagliate++;
    this.haptics.error();
    this.audioService.playErrorQuiz();

    setTimeout(() => {
      this.mostraModaleErrore = true;
    }, 450);
  }

  // Restituisce la classe grafica della risposta dopo la selezione.
  classeRisposta(index: number): string {
    const question = this.domandaCorrente;

    if (!this.haRisposto || !question) return '';

    if (index === question.correctIndex) return 'correct';

    if (index === this.indiceRispostaSelezionata && !this.rispostaCorretta) {
      return 'wrong';
    }

    return '';
  }

  // Gestisce l’acquisto e l’applicazione di un aiuto usando il service dedicato.
  async usaAiuto(helpId: HelpId) {
    this.haptics.light();

    const risultato = await this.quizAiutiTimerService.usaAiuto({
      idAiuto: helpId,
      aiutiDisponibili: this.aiuti,
      aiutiUsati: this.aiutiUsati,
      domandaCorrente: this.domandaCorrente,
      haRisposto: this.haRisposto,
      mostraModaleTempo: this.mostraModaleTempo,
      mostraModaleUscita: this.mostraModaleUscita,
      animazioneAiutoAttiva: !!this.animazioneAiuto,
      modalitaSfidaGiornaliera: this.modalitaSfidaGiornaliera,
      modalitaScalata: this.modalitaScalata,
      idCategoria: this.idCategoria,
      idDifficolta: this.idDifficolta,
      numeroLivello: this.numeroLivello,
      numeroLivelloScalata: this.numeroLivelloVisualizzato,
      eseguiAnimazione: () => this.riproduciAnimazioneAiuto(helpId),
    });

    if (risultato.esito === 'monete_insufficienti') {
      this.moneteNecessarie = risultato.costoRichiesto ?? 0;
      this.fermaTimer();
      this.mostraModaleMonete = true;
      return;
    }

    if (
      risultato.esito === 'pagamento_fallito' ||
      risultato.esito === 'bloccato' ||
      risultato.esito === 'aiuto_non_trovato' ||
      risultato.esito === 'domanda_non_trovata'
    ) {
      return;
    }

    this.aiutiUsati.push(helpId);

    if (risultato.risposteDaNascondere) {
      this.risposteNascoste = risultato.risposteDaNascondere;
    }

    if (risultato.percentualiPubblico) {
      this.percentualiPubblico = risultato.percentualiPubblico;
      this.mostraSuggerimentoPubblico = true;
    }

    if (risultato.nuovaDomanda) {
      this.applicaNuovaDomanda(risultato.nuovaDomanda);
    }
  }

  // Inserisce una nuova domanda al posto di quella attuale e riavvia lo stato della domanda.
  private applicaNuovaDomanda(nuovaDomanda: QuestionModel) {
    if (this.modalitaSfidaGiornaliera) {
      this.domande[this.indiceCorrente] = nuovaDomanda;
    } else {
      this.domande = [nuovaDomanda];
      this.indiceCorrente = 0;
    }

    this.avviaDomandaCorrente();
  }

  // Passa alla domanda successiva oppure conclude il quiz.
  async prossimaDomanda() {
    this.haptics.light();
    if (this.indiceCorrente >= this.domande.length - 1) {
      await this.concludiQuiz();
      return;
    }

    this.indiceCorrente++;
    this.avviaDomandaCorrente();
  }

  // Conclude il quiz e assegna premi/progressi in base alla modalità.
  async concludiQuiz() {
    if (this.modalitaSfidaGiornaliera) {
      await this.concludiSfidaGiornaliera();
      return;
    }

    if (this.modalitaScalata) {
      await this.concludiLivelloScalata();
      return;
    }

    const user = await firstValueFrom(this.auth.user$);

    const risultato = await this.quizCompletamentoService.completaQuizNormale({
      userId: user?.uid,
      idCategoria: this.idCategoria,
      idDifficolta: this.idDifficolta,
      numeroLivello: this.numeroLivello,
      risposteCorrette: this.risposteCorrette,
      totaleDomande: this.domande.length,
      livelloGiaCompletato: this.livelloGiaCompletato,
      numeriLivelliDifficolta: this.numeriLivelliDifficolta,
    });

    if (risultato.esito === 'premio') {
      this.livelloGiaCompletato = risultato.livelloCompletato;
      this.premioXp = risultato.premioXp;
      this.premioRaddoppiato = false;
      this.raddoppioPremioInCaricamento = false;
      this.messaggioPremio = `Hai completato il livello ${this.numeroLivelloVisualizzato}!`;
      this.messaggioSbloccoPremio = this.recuperaMessaggioSbloccoPremio();
      this.mostraModalePremio = true;
      return;
    }

    this.navigatingAway = true;
    this.vaiAllaPaginaDiUscita();
  }

  // Marca la domanda corrente come sbagliata senza cambiare subito schermata.
  segnaDomandaCorrenteComeSbagliata() {
    if (this.haRisposto) return;

    this.haRisposto = true;
    this.rispostaCorretta = false;
    this.risposteSbagliate++;
    this.haptics.light();
    this.fermaTimer();
  }

  // Ripulisce lo stato grafico e logico della domanda corrente.
  resettaStatoDomanda() {
    this.indiceRispostaSelezionata = null;
    this.haRisposto = false;
    this.rispostaCorretta = false;
    this.risposteNascoste = [];
    this.mostraModaleErrore = false;
    this.mostraModaleTempo = false;
    this.mostraModaleUscita = false;
    this.mostraSuggerimentoPubblico = false;
    this.lifeLostForLeaving = false;
    this.tempoRimasto = this.tempoMassimo;
  }

  // Consuma una vita dopo errore e continua secondo la modalità.
  async perdiVitaEContinua() {
    if (this.modalitaScalata) {
      await this.perdiVitaScalataEEsci();
      return;
    }

    await this.livesService.spendLife();
    this.mostraModaleErrore = false;
    this.prossimaDomanda();
  }

  // Dopo un errore, mostra un video reward e permette di continuare.
  async guardaVideoEContinua() {
    this.adInProgress = true;

    try {
      const premioOttenuto =
        await this.quizVideoRewardService.mostraVideoReward();
      if (!premioOttenuto) return;

      this.mostraModaleErrore = false;

      if (this.modalitaSfidaGiornaliera) {
        this.riprovaDomandaSfidaGiornaliera();
        return;
      }

      if (this.modalitaScalata) {
        await this.cambiaDomanda();
        return;
      }

      await this.caricaDomande();
    } finally {
      this.adInProgress = false;
    }
  }

  // Mostra un video reward per ottenere secondi extra sulla stessa domanda.
  async guardaVideoPerPiuTempo() {
    this.adInProgress = true;

    try {
      const premioOttenuto =
        await this.quizVideoRewardService.mostraVideoReward();
      if (!premioOttenuto) return;

      this.mostraModaleTempo = false;
      this.haRisposto = false;
      this.rispostaCorretta = false;
      this.indiceRispostaSelezionata = null;
      this.tempoRimasto = 5;
      this.avviaTimer();
    } finally {
      this.adInProgress = false;
    }
  }

  // Gestisce la scelta di perdere una vita quando il timer è scaduto.
  async perdiVitaDopoTempoScaduto() {
    if (this.modalitaSfidaGiornaliera) {
      await this.ricominciaSfidaGiornaliera();
      return;
    }

    if (this.modalitaScalata) {
      await this.perdiVitaScalataEEsci();
      return;
    }

    await this.livesService.spendLife();

    this.segnaDomandaCorrenteComeSbagliata();
    this.mostraModaleTempo = false;
    this.prossimaDomanda();
  }

  // Mostra un video reward per guadagnare monete quando non bastano per un aiuto.
  async guardaVideoPerMonete() {
    this.adInProgress = true;

    try {
      await this.quizVideoRewardService.aggiungiMoneteDaVideo(10);
      this.mostraModaleMonete = false;
      this.riavviaTimerSeDomandaAttiva();
    } finally {
      this.adInProgress = false;
    }
  }

  // Chiude la modale monete e riavvia il timer se la domanda è ancora attiva.
  chiudiModaleMonete() {
    this.mostraModaleMonete = false;
    this.riavviaTimerSeDomandaAttiva();
  }

  // Riavvia il timer solo se la domanda è ancora attiva e valida.
  private riavviaTimerSeDomandaAttiva() {
    if (!this.haRisposto && this.domandaCorrente && this.tempoRimasto > 0) {
      this.avviaTimer();
    }
  }

  // Controlla se il premio XP del quiz normale può essere raddoppiato.
  private puoRaddoppiarePremioXp(): boolean {
    return (
      !this.raddoppioPremioInCaricamento &&
      !this.premioRaddoppiato &&
      this.premioXp > 0
    );
  }

  // Controlla se il premio in monete della Sfida Daily può essere raddoppiato.
  private puoRaddoppiarePremioSfidaGiornaliera(): boolean {
    return (
      !this.raddoppioPremioInCaricamento &&
      !this.premioRaddoppiato &&
      this.premioMoneteSfidaGiornaliera > 0
    );
  }

  // Chiude la modale premio e torna alla schermata corretta.
  continuaDopoPremio() {
    this.haptics.heavy();
    this.mostraModalePremio = false;
    this.navigatingAway = true;

    this.vaiAllaPaginaDiUscita();
  }

  // Raddoppia il premio tramite video reward, se possibile.
  async guardaVideoERaddoppiaPremio() {
    if (this.modalitaSfidaGiornaliera) {
      await this.guardaVideoERaddoppiaPremioSfidaGiornaliera();
      return;
    }

    if (!this.puoRaddoppiarePremioXp()) return;

    this.raddoppioPremioInCaricamento = true;
    this.adInProgress = true;

    try {
      const risultato = await this.quizVideoRewardService.raddoppiaPremioXp(
        this.premioXp,
      );

      if (!risultato.riuscito) return;

      this.premioXp += risultato.bonusXp;
      this.premioRaddoppiato = true;
    } finally {
      this.adInProgress = false;
      this.raddoppioPremioInCaricamento = false;
    }
  }

  // Gestisce il tasto indietro interno mostrando conferma quando serve.
  tornaIndietro() {
    if (this.caricamento || !this.domandaCorrente) {
      this.navigatingAway = true;
      this.vaiAllaPaginaDiUscita();
      return;
    }

    this.mostraModaleUscita = true;
  }

  // Chiude la conferma di uscita e ripristina lo stato corretto.
  chiudiModaleUscita() {
    this.mostraModaleUscita = false;

    if (this.tempoRimasto <= 0) {
      this.mostraModaleTempo = true;
    }
  }

  // Conferma l’uscita dal quiz e applica eventuale perdita di vita.
  async confermaUscitaQuiz() {
    this.mostraModaleUscita = false;
    this.fermaTimer();
    this.navigatingAway = true;

    if (this.modalitaSfidaGiornaliera || this.modalitaScalata) {
      this.vaiAllaPaginaDiUscita();
      return;
    }

    await this.livesService.spendLife();
    this.vaiAllaPaginaDiUscita();
  }

  // Torna alla pagina eventi dalla Sfida Daily.
  tornaAgliEventi() {
    this.haptics.light();
    this.fermaTimer();
    this.mostraModaleErrore = false;
    this.mostraModaleTempo = false;
    this.mostraModaleUscita = false;
    this.navigatingAway = true;
    void this.navigation.navigateByUrl('/events/challenge');
  }

  // Nella Scalata registra l’errore, consuma una vita e torna alla mappa.
  private async perdiVitaScalataEEsci() {
    const user = await firstValueFrom(this.auth.user$);

    if (user) {
      await this.userStatsService.recordArcadeMistake(user.uid);
    }

    await this.livesService.spendLife();

    this.segnaDomandaCorrenteComeSbagliata();
    this.mostraModaleErrore = false;
    this.mostraModaleTempo = false;
    this.navigatingAway = true;
    this.vaiAllaPaginaDiUscita();
  }

  // Prepara una nuova domanda e fa partire il timer.
  private avviaDomandaCorrente() {
    this.resettaStatoDomanda();

    if (
      this.modalitaSfidaGiornaliera &&
      !this.trackedDailyQuestionIndexes.has(this.indiceCorrente)
    ) {
      this.trackedDailyQuestionIndexes.add(this.indiceCorrente);
      void this.dailyEventsService.trackDailyChallengeQuestion();
    }

    this.avviaTimer();
  }

  // Avvia il countdown della domanda corrente usando il service dedicato.
  avviaTimer() {
    this.fermaTimer(false);
    this.audioService.playCountdownQuiz();

    this.quizAiutiTimerService.avviaTimer({
      tempoIniziale: this.tempoRimasto,
      onTick: ({ tempoRimasto }) => {
        this.tempoRimasto = tempoRimasto;
      },
      onScaduto: () => {
        this.audioService.stopGameSound();
        this.audioService.playFinishTime();
        this.tempoRimasto = 0;
        this.mostraModaleUscita = false;
        this.mostraModaleTempo = true;
      },
    });
  }

  // Ferma il countdown e, se richiesto, anche il suono collegato.
  fermaTimer(interrompiSuono = true) {
    this.quizAiutiTimerService.fermaTimer();

    if (interrompiSuono) {
      this.audioService.stopGameSound();
    }
  }

  // Registra il completamento del livello Scalata e prepara premi/transizione.
  private async concludiLivelloScalata() {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      this.navigatingAway = true;
      this.vaiAllaPaginaDiUscita();
      return;
    }

    const reward = this.calcolaPremioScalata(this.numeroLivelloVisualizzato);
    const updatedArcade =
      await this.userStatsService.recordArcadeLevelCompleted(
        user.uid,
        this.numeroLivelloVisualizzato,
        reward.totalCoins,
        reward.totalXp,
      );

    if (!updatedArcade) {
      this.navigatingAway = true;
      this.vaiAllaPaginaDiUscita();
      return;
    }

    this.premioMoneteScalata = reward.baseCoins;
    this.premioXpScalata = reward.baseXp;
    this.premioMoneteForziereScalata = reward.bonusCoins;
    this.premioXpForziereScalata = reward.bonusXp;
    this.premioScalataHaBonus = reward.hasBonus;

    await this.riproduciTransizioneScalata(
      this.numeroLivelloVisualizzato,
      updatedArcade.currentLevel,
      !reward.hasBonus,
    );

    if (reward.hasBonus) {
      this.mostraModaleForziereScalata = true;
      return;
    }

    /*
     * Nei livelli normali della Scalata non carichiamo subito la domanda
     * successiva: lasciamo scegliere al giocatore se continuare o tornare
     * alla mappa.
     */
  }

  // Dopo la transizione della Scalata, carica il livello successivo.
  async continuaDopoTransizioneScalata() {
    this.haptics.light();
    this.caricamento = true;
    this.transizioneScalataVisibile = false;
    this.transizioneScalataPronta = false;
    this.aiutiUsati = [];
    await this.caricaDomande();
  }

  // Dopo la transizione, torna alla mappa della Scalata.
  tornaMappaScalataDopoTransizione() {
    this.haptics.light();
    this.transizioneScalataVisibile = false;
    this.transizioneScalataPronta = false;
    this.navigatingAway = true;
    this.vaiAllaPaginaDiUscita();
  }

  // Chiude il forziere bonus e torna alla mappa della Scalata.
  continuaDopoForziereScalata() {
    this.haptics.heavy();
    this.mostraModaleForziereScalata = false;
    this.navigatingAway = true;
    this.vaiAllaPaginaDiUscita();
  }

  // Calcola monete e XP del livello Scalata, incluso eventuale bonus forziere.
  private calcolaPremioScalata(arcadeLevel: number): {
    baseCoins: number;
    baseXp: number;
    bonusCoins: number;
    bonusXp: number;
    totalCoins: number;
    totalXp: number;
    hasBonus: boolean;
  } {
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

  // Mostra l’animazione tra un livello Scalata e il successivo.
  private async riproduciTransizioneScalata(
    fromLevel: number,
    toLevel: number,
    waitForUserChoice: boolean,
  ) {
    this.transizioneScalataDa = fromLevel;
    this.transizioneScalataA = toLevel;
    this.transizioneScalataPronta = false;
    this.transizioneScalataVisibile = true;

    await this.wait(this.premioScalataHaBonus ? 1900 : 1350);

    if (waitForUserChoice) {
      this.transizioneScalataPronta = true;
      return;
    }

    this.transizioneScalataVisibile = false;
  }

  // Completa la Sfida Daily e prepara la modale premio.
  private async concludiSfidaGiornaliera() {
    const result = await this.dailyEventsService.completeDailyChallenge(
      this.risposteCorrette,
      this.domande.length,
      this.aiutiUsati.length,
    );

    this.premioMoneteSfidaGiornaliera = result.rewardCoins;
    this.premioSfidaGiornalieraGiaRiscosso = result.alreadyClaimed;
    this.premioRaddoppiato = false;
    this.raddoppioPremioInCaricamento = false;
    this.messaggioPremio = result.alreadyClaimed
      ? 'Sfida giornaliera completata. Il premio di oggi era già stato riscosso.'
      : `Hai completato la sfida e ottenuto ${result.rewardCoins} TurtleCoins.`;
    this.messaggioSbloccoPremio =
      this.risposteCorrette === this.domande.length
        ? 'Percorso perfetto'
        : `${this.risposteCorrette}/${this.domande.length} risposte corrette`;
    this.mostraModalePremio = true;
  }

  // Azzera la run della Sfida Daily e ricarica nuove domande.
  async ricominciaSfidaGiornaliera() {
    if (!this.modalitaSfidaGiornaliera) return;

    this.fermaTimer();
    this.mostraModaleErrore = false;
    this.mostraModaleTempo = false;
    this.mostraModaleUscita = false;
    this.aiutiUsati = [];
    this.indiceRispostaSelezionata = null;
    this.risposteNascoste = [];
    this.mostraSuggerimentoPubblico = false;
    await this.caricaDomande();
  }

  // Dopo video reward, fa riprovare la stessa domanda Daily.
  private riprovaDomandaSfidaGiornaliera() {
    this.resettaStatoDomanda();
    this.avviaTimer();
  }

  // Raddoppia il premio della Sfida Daily tramite video reward.
  private async guardaVideoERaddoppiaPremioSfidaGiornaliera() {
    if (!this.puoRaddoppiarePremioSfidaGiornaliera()) return;

    this.raddoppioPremioInCaricamento = true;
    this.adInProgress = true;

    try {
      const risultato =
        await this.quizVideoRewardService.raddoppiaPremioSfidaGiornaliera();

      if (!risultato.riuscito) return;

      this.premioMoneteSfidaGiornaliera += risultato.bonusCoins;
      this.premioRaddoppiato = true;
      this.messaggioPremio = `Premio raddoppiato: ${this.premioMoneteSfidaGiornaliera} TurtleCoins.`;
    } finally {
      this.adInProgress = false;
      this.raddoppioPremioInCaricamento = false;
    }
  }

  // Naviga alla schermata corretta in base alla modalità attiva.
  private vaiAllaPaginaDiUscita() {
    if (this.modalitaSfidaGiornaliera) {
      void this.navigation.navigateByUrl('/events/challenge');
      return;
    }

    if (this.modalitaScalata) {
      void this.navigation.navigateByUrl('/arcade');
      return;
    }

    void this.navigation.navigateByUrl(
      `/levels/${this.idCategoria}/${this.idDifficolta}`,
    );
  }

  // Prepara il testo che indica il prossimo livello sbloccato.
  private recuperaMessaggioSbloccoPremio(): string {
    const currentLevelIndex = this.numeriLivelliDifficolta.indexOf(
      this.numeroLivello,
    );
    const nextDisplayLevel = currentLevelIndex + 2;

    if (
      currentLevelIndex >= 0 &&
      nextDisplayLevel <= this.numeriLivelliDifficolta.length
    ) {
      return `Livello ${nextDisplayLevel} sbloccato`;
    }

    return 'Difficolta completata';
  }

  // Sostituisce la domanda corrente usando il service, rispettando quiz normale, Daily e Scalata.
  private async cambiaDomanda() {
    if (this.cambioDomandaInCorso) return;

    this.cambioDomandaInCorso = true;

    try {
      const nuovaDomanda =
        await this.quizAiutiTimerService.recuperaNuovaDomanda({
          modalitaSfidaGiornaliera: this.modalitaSfidaGiornaliera,
          modalitaScalata: this.modalitaScalata,
          idCategoria: this.idCategoria,
          idDifficolta: this.idDifficolta,
          numeroLivello: this.numeroLivello,
          numeroLivelloScalata: this.numeroLivelloVisualizzato,
        });

      if (!nuovaDomanda) return;

      this.applicaNuovaDomanda(nuovaDomanda);
    } finally {
      this.cambioDomandaInCorso = false;
    }
  }

  // Mette in pausa il timer durante animazioni o modali.
  private mettiTimerInPausa() {
    this.fermaTimer();
  }

  // Riavvia il timer se la domanda è ancora giocabile.
  private riprendiTimer() {
    if (!this.haRisposto && !this.mostraModaleTempo && this.domandaCorrente) {
      this.avviaTimer();
    }
  }

  // Mostra la piccola animazione dell’aiuto e poi riprende il timer.
  private async riproduciAnimazioneAiuto(helpId: HelpId) {
    this.mettiTimerInPausa();
    this.animazioneAiuto = helpId;
    await this.wait(1600);
    this.animazioneAiuto = null;
    this.riprendiTimer();
  }

  // Pulizia finale: ferma timer e listener dell’app.
  ngOnDestroy() {
    this.fermaTimer();
    this.appStateListener?.remove();
  }
}
