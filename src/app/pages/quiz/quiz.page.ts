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
import { QuizScalataService } from 'src/app/services/quiz-scalata.service';

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
  private quizScalataService = inject(QuizScalataService);

  private appStateListener?: PluginListenerHandle;

  private adInProgress = false;
  private lifeLostForLeaving = false;
  private navigatingAway = false;
  levelAlreadyCompleted = false;
  rewardDoubleLoading = false;
  rewardDoubled = false;
  dailyChallengeMode = false;
  arcadeMode = false;
  dailyChallengeRewardCoins = 0;
  dailyChallengeRewardAlreadyClaimed = false;
  arcadeRewardCoins = 0;
  arcadeRewardXp = 0;
  arcadeChestRewardCoins = 0;
  arcadeChestRewardXp = 0;
  arcadeRewardHasBonus = false;
  arcadeTransitionVisible = false;
  arcadeTransitionReady = false;
  arcadeTransitionFrom = 1;
  arcadeTransitionTo = 2;
  showArcadeChestRewardModal = false;

  difficultyId: DifficultyId = 'easy';
  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  difficultyTitle = 'Easy';
  categoryId = '';
  rewardMessage = '';
  rewardUnlockedMessage = '';

  timeLeft = 15;
  readonly maxTime = 15;
  audiencePercentages = [15, 20, 50, 15];
  levelNumber = 1;
  displayLevelNumber = 1;
  totalLevels = 0;
  numeroLivelloSuccessivoDiretto: number | null = null;
  mostraPulsanteLivelloSuccessivo = false;
  difficultyLevelNumbers: number[] = [];
  currentIndex = 0;
  correctAnswers = 0;
  wrongAnswers = 0;
  rewardXp = 0;
  readonly xpPerQuestion = USER_STATS_CONFIG.xpPerCorrectAnswer;
  neededCoins = 0;
  selectedAnswerIndex: number | null = null;
  hiddenAnswers: number[] = [];

  questions: QuestionModel[] = [];
  usedHelps: HelpId[] = [];
  helpAnimation: HelpId | null = null;

  loading = true;
  answered = false;
  isCorrect = false;
  showWrongModal = false;
  showTimeModal = false;
  showCoinsModal = false;
  showAudienceHint = false;
  showExitModal = false;
  showRewardModal = false;
  switchingQuestion = false;

  coins$ = this.coinsService.coins$;
  lives$ = this.livesService.lives$;

  private trackedDailyQuestionIndexes = new Set<number>();

  helps: HelpModel[] = [...HELPS];

  async ngOnInit() {
    this.audioService.suspendMusicForGame();

    const cleanUrl = this.router.url.split('?')[0];

    this.dailyChallengeMode = cleanUrl.startsWith('/daily-challenge');
    this.arcadeMode = cleanUrl.startsWith('/arcade/play');

    if (this.dailyChallengeMode) {
      this.setupDailyChallengeLabels();
      await this.dailyEventsService.trackDailyChallengeStarted();
    } else if (this.arcadeMode) {
      await this.setupArcadeLabels();
    } else {
      this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';
      this.difficultyId =
        (this.route.snapshot.paramMap.get('difficultyId') as DifficultyId) ||
        'easy';
      this.levelNumber = Number(
        this.route.snapshot.paramMap.get('levelNumber') || 1,
      );

      this.setupLabels();
      await this.setupLevelProgress();
    }

    await this.listenToAppState();
    await this.loadQuestions();
  }

  ionViewWillEnter() {
    this.audioService.suspendMusicForGame();
  }

  private async setupLevelProgress() {
    const user = await firstValueFrom(this.auth.user$);

    const [difficultyLevelNumbers, levelAlreadyCompleted] = await Promise.all([
      this.questionsService.getDifficultyLevelNumbers(
        this.categoryId,
        this.difficultyId,
      ),
      user
        ? this.progressService.isLevelCompleted(
            user.uid,
            this.categoryId,
            this.difficultyId,
            this.levelNumber,
          )
        : Promise.resolve(false),
    ]);

    this.difficultyLevelNumbers = difficultyLevelNumbers;
    this.levelAlreadyCompleted = levelAlreadyCompleted;

    const currentLevelIndex = this.difficultyLevelNumbers.indexOf(
      this.levelNumber,
    );

    this.totalLevels = this.difficultyLevelNumbers.length;
    this.displayLevelNumber =
      currentLevelIndex >= 0 ? currentLevelIndex + 1 : this.levelNumber;

    this.aggiornaPulsanteLivelloSuccessivo(currentLevelIndex);
  }

  /**
   * Calcola se nella modale premio possiamo mostrare il tasto
   * per passare direttamente al livello successivo.
   * Il tasto resta nascosto su sfida giornaliera, scalata e ultimo livello della difficoltà.
   */
  private aggiornaPulsanteLivelloSuccessivo(currentLevelIndex: number) {
    const prossimoLivello =
      currentLevelIndex >= 0
        ? this.difficultyLevelNumbers[currentLevelIndex + 1]
        : null;

    this.numeroLivelloSuccessivoDiretto = prossimoLivello ?? null;

    this.mostraPulsanteLivelloSuccessivo =
      !this.dailyChallengeMode &&
      !this.arcadeMode &&
      this.numeroLivelloSuccessivoDiretto !== null;
  }

  ionViewWillLeave() {
    this.stopTimer();
    void this.audioService.resumeMusicAfterGame();
  }

  async loadQuestions() {
    this.loading = true;

    const questionsPromise = this.getQuestionsForCurrentMode();
    const minLoaderMs = this.arcadeMode
      ? 360
      : this.dailyChallengeMode
        ? 520
        : 650;

    const [questions] = await Promise.all([
      questionsPromise,
      this.wait(minLoaderMs),
    ]);

    this.questions = questions;
    this.trackedDailyQuestionIndexes.clear();

    this.loading = false;

    this.currentIndex = 0;
    this.correctAnswers = 0;
    this.wrongAnswers = 0;

    if (this.questions.length === 0) {
      this.stopTimer();
      return;
    }

    this.startCurrentQuestion();
  }

  private async getQuestionsForCurrentMode(): Promise<QuestionModel[]> {
    if (this.dailyChallengeMode) {
      return this.questionsService.getRandomActiveQuestions(
        DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount,
        DAILY_EVENTS_CONFIG.dailyChallengeDifficulty,
      );
    }

    if (this.arcadeMode) {
      return this.getArcadeQuestion();
    }

    return this.questionsService.getQuestions(
      this.categoryId,
      this.difficultyId,
      this.levelNumber,
      1,
    );
  }

  private async getArcadeQuestion(): Promise<QuestionModel[]> {
    const user = await firstValueFrom(this.auth.user$);
    const selection =
      await this.quizScalataService.recuperaDomandaScalata(user);

    if (!selection) {
      const arcade = user
        ? await this.userStatsService.getArcadeData(user.uid)
        : this.userStatsService.defaultArcade;

      this.displayLevelNumber = arcade.currentLevel;
      this.totalLevels =
        await this.quizScalataService.recuperaTotaleLivelliScalata();
      return [];
    }

    this.displayLevelNumber = selection.livelloScalata;
    this.totalLevels = selection.totaleLivelli;
    this.difficultyId = selection.idDifficolta;
    this.levelNumber = selection.numeroLivello;
    this.difficultyTitle = this.getDifficultyTitle(selection.idDifficolta);

    return [selection.domanda];
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  private async handleAppBackgrounded() {
    if (this.adInProgress) return;
    if (this.lifeLostForLeaving) return;
    if (this.navigatingAway) return;
    if (this.loading || !this.currentQuestion) return;

    const isInsideActiveQuestion =
      !this.answered || this.showTimeModal || this.showExitModal;

    if (!isInsideActiveQuestion) return;

    this.lifeLostForLeaving = true;
    this.navigatingAway = true;

    await this.livesService.spendLife();

    this.stopTimer();
    this.goToExitPage();
  }

  setupLabels() {
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

    this.categoryTitle = categories[this.categoryId]?.title || 'Quiz';
    this.categoryIcon = categories[this.categoryId]?.icon || '❓';
    this.difficultyTitle = this.getDifficultyTitle(this.difficultyId);
  }

  setupDailyChallengeLabels() {
    this.categoryId = 'daily';
    this.categoryTitle = 'Sfida Daily';
    this.categoryIcon = '';
    this.difficultyTitle = 'Random';
    this.levelNumber = 1;
    this.displayLevelNumber = 1;
    this.totalLevels = DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount;
  }

  private async setupArcadeLabels() {
    this.categoryId = 'arcade';
    this.categoryTitle = 'Scalata';
    this.categoryIcon = '⚡';
    this.difficultyId = 'easy';
    this.difficultyTitle = 'Progressiva';
    this.levelNumber = 1;
    this.displayLevelNumber = 1;
    this.totalLevels = await this.questionsService.getArcadeTotalLevels();
  }

  private getDifficultyTitle(difficultyId: DifficultyId): string {
    const difficulties: Record<DifficultyId, string> = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      extreme: 'Extreme',
    };

    return difficulties[difficultyId] || 'Easy';
  }

  get currentQuestion(): QuestionModel | null {
    return this.questions[this.currentIndex] || null;
  }

  get progressPercent(): number {
    if (!this.questions.length) return 0;

    if (this.arcadeMode) {
      const stepInBonus =
        ((this.displayLevelNumber - 1) % ARCADE_CONFIG.bonusEveryLevels) + 1;

      return (stepInBonus / ARCADE_CONFIG.bonusEveryLevels) * 100;
    }

    return ((this.currentIndex + 1) / this.questions.length) * 100;
  }

  get questionProgressLabel(): string {
    if (this.arcadeMode) {
      return `Livello Scalata ${this.displayLevelNumber}/${this.totalLevels}`;
    }

    if (this.dailyChallengeMode) {
      return `Domanda ${this.currentIndex + 1}/${this.questions.length}`;
    }

    return `Domanda ${this.displayLevelNumber}/${this.totalLevels}`;
  }

  get correctRewardLabel(): string {
    if (this.arcadeMode) {
      return `+${ARCADE_CONFIG.baseXpPerLevel} XP +${ARCADE_CONFIG.baseCoinsPerLevel}`;
    }

    return `+${this.xpPerQuestion} XP`;
  }

  get timerPercent(): number {
    return this.quizAiutiTimerService.calcolaPercentualeTimer(
      this.timeLeft,
      this.maxTime,
    );
  }

  get answerLetters() {
    return ['A', 'B', 'C', 'D'];
  }

  selectAnswer(index: number) {
    if (
      this.answered ||
      this.hiddenAnswers.includes(index) ||
      this.showExitModal ||
      this.showTimeModal
    ) {
      return;
    }

    const question = this.currentQuestion;
    if (!question) return;

    this.selectedAnswerIndex = index;
    this.answered = true;
    this.isCorrect = index === question.correctIndex;

    this.stopTimer();

    if (this.isCorrect) {
      this.correctAnswers++;
      this.haptics.success();
      this.audioService.playCorrectQuiz();

      if (this.dailyChallengeMode) {
        void this.dailyEventsService.trackDailyChallengeCorrect();
      }

      setTimeout(() => {
        this.nextQuestion();
      }, 700);

      return;
    }

    this.wrongAnswers++;
    this.haptics.error();
    this.audioService.playErrorQuiz();

    setTimeout(() => {
      this.showWrongModal = true;
    }, 450);
  }

  getAnswerClass(index: number): string {
    const question = this.currentQuestion;

    if (!this.answered || !question) return '';

    if (index === question.correctIndex) return 'correct';

    if (index === this.selectedAnswerIndex && !this.isCorrect) {
      return 'wrong';
    }

    return '';
  }

  async useHelp(helpId: HelpId) {
    this.haptics.light();

    const risultato = await this.quizAiutiTimerService.usaAiuto({
      idAiuto: helpId,
      aiutiDisponibili: this.helps,
      aiutiUsati: this.usedHelps,
      domandaCorrente: this.currentQuestion,
      haRisposto: this.answered,
      mostraModaleTempo: this.showTimeModal,
      mostraModaleUscita: this.showExitModal,
      animazioneAiutoAttiva: !!this.helpAnimation,
      modalitaSfidaGiornaliera: this.dailyChallengeMode,
      modalitaScalata: this.arcadeMode,
      idCategoria: this.categoryId,
      idDifficolta: this.difficultyId,
      numeroLivello: this.levelNumber,
      numeroLivelloScalata: this.displayLevelNumber,
      eseguiAnimazione: () => this.playHelpAnimation(helpId),
    });

    if (risultato.esito === 'monete_insufficienti') {
      this.neededCoins = risultato.costoRichiesto ?? 0;
      this.stopTimer();
      this.showCoinsModal = true;
      return;
    }

    if (risultato.esito !== 'ok') return;

    this.usedHelps.push(helpId);

    if (risultato.risposteDaNascondere) {
      this.hiddenAnswers = risultato.risposteDaNascondere;
    }

    if (risultato.percentualiPubblico) {
      this.showAudienceHint = true;
      this.audiencePercentages = risultato.percentualiPubblico;
    }

    if (risultato.nuovaDomanda) {
      this.applicaNuovaDomanda(risultato.nuovaDomanda);
    }
  }

  async nextQuestion() {
    this.haptics.light();
    if (this.currentIndex >= this.questions.length - 1) {
      await this.finishQuiz();
      return;
    }

    this.currentIndex++;
    this.startCurrentQuestion();
  }

  async finishQuiz() {
    if (this.dailyChallengeMode) {
      await this.finishDailyChallenge();
      return;
    }

    if (this.arcadeMode) {
      await this.finishArcadeLevel();
      return;
    }

    const user = await firstValueFrom(this.auth.user$);
    const risultato = await this.quizCompletamentoService.completaQuizNormale({
      user,
      categoryId: this.categoryId,
      difficultyId: this.difficultyId,
      levelNumber: this.levelNumber,
      displayLevelNumber: this.displayLevelNumber,
      correctAnswers: this.correctAnswers,
      totalQuestions: this.questions.length,
      levelAlreadyCompleted: this.levelAlreadyCompleted,
      difficultyLevelNumbers: this.difficultyLevelNumbers,
    });

    this.levelAlreadyCompleted = risultato.levelAlreadyCompleted;

    if (risultato.completatoConPremio) {
      this.rewardXp = risultato.rewardXp;
      this.rewardDoubled = false;
      this.rewardDoubleLoading = false;
      this.rewardMessage = risultato.rewardMessage;
      this.rewardUnlockedMessage = risultato.rewardUnlockedMessage;
      this.showRewardModal = true;
      return;
    }

    this.navigatingAway = true;
    this.goToExitPage();
  }

  markCurrentQuestionAsWrong() {
    if (this.answered) return;

    this.answered = true;
    this.isCorrect = false;
    this.wrongAnswers++;
    this.haptics.light();
    this.stopTimer();
  }

  resetQuestionState() {
    this.selectedAnswerIndex = null;
    this.answered = false;
    this.isCorrect = false;
    this.hiddenAnswers = [];
    this.showWrongModal = false;
    this.showTimeModal = false;
    this.showExitModal = false;
    this.showAudienceHint = false;
    this.lifeLostForLeaving = false;
    this.timeLeft = this.maxTime;
  }

  async loseLifeAndContinue() {
    if (this.arcadeMode) {
      await this.loseArcadeLifeAndExit();
      return;
    }

    await this.livesService.spendLife();
    this.showWrongModal = false;
    this.nextQuestion();
  }

  async watchAdAndContinue() {
    this.adInProgress = true;

    try {
      const reward = await this.quizVideoRewardService.guardaVideoReward();

      if (!reward) return;

      this.showWrongModal = false;

      if (this.dailyChallengeMode) {
        this.retryCurrentDailyChallengeQuestion();
        return;
      }

      if (this.arcadeMode) {
        await this.switchQuestion();
        return;
      }

      await this.loadQuestions();
    } finally {
      this.adInProgress = false;
    }
  }

  async watchAdForMoreTime() {
    this.adInProgress = true;

    try {
      const reward = await this.quizVideoRewardService.guardaVideoReward();

      if (!reward) return;

      this.showTimeModal = false;
      this.answered = false;
      this.isCorrect = false;
      this.selectedAnswerIndex = null;
      this.timeLeft = 5;
      this.startTimer();
    } finally {
      this.adInProgress = false;
    }
  }

  async loseLifeAfterTimeExpired() {
    if (this.dailyChallengeMode) {
      await this.restartDailyChallenge();
      return;
    }

    if (this.arcadeMode) {
      await this.loseArcadeLifeAndExit();
      return;
    }

    await this.livesService.spendLife();

    this.markCurrentQuestionAsWrong();
    this.showTimeModal = false;
    this.nextQuestion();
  }

  async watchAdForCoins() {
    this.adInProgress = true;

    try {
      await this.quizVideoRewardService.guardaVideoPerMonete(10);

      this.showCoinsModal = false;
      if (!this.answered && this.currentQuestion && this.timeLeft > 0) {
        this.startTimer();
      }
    } finally {
      this.adInProgress = false;
    }
  }

  closeCoinsModal() {
    this.showCoinsModal = false;

    if (!this.answered && this.currentQuestion && this.timeLeft > 0) {
      this.startTimer();
    }
  }

  /**
   * Chiude la modale premio e torna alla schermata dei livelli.
   * È il comportamento già esistente del bottone "Continua".
   */
  continueAfterReward() {
    this.haptics.heavy();
    this.showRewardModal = false;
    this.navigatingAway = true;

    this.goToExitPage();
  }

  /**
   * Nuovo flusso per i quiz normali: dalla modale premio porta subito
   * al livello successivo della stessa categoria/difficoltà, senza passare dai livelli.
   *
   * Fix importante: Ionic/Angular può riutilizzare la stessa QuizPage quando cambia
   * solo il parametro della rotta. Per questo non ci limitiamo a navigare, ma
   * aggiorniamo anche lo stato interno della pagina e ricarichiamo subito domande/progressi.
   */
  async vaiAlLivelloSuccessivoDiretto() {
    const prossimoLivello = this.numeroLivelloSuccessivoDiretto;

    if (!this.mostraPulsanteLivelloSuccessivo || !prossimoLivello) {
      return;
    }

    this.haptics.heavy();
    this.stopTimer();

    this.showRewardModal = false;
    this.showWrongModal = false;
    this.showTimeModal = false;
    this.showExitModal = false;
    this.navigatingAway = false;

    this.levelNumber = prossimoLivello;

    void this.router.navigateByUrl(
      `/quiz/${this.categoryId}/${this.difficultyId}/${prossimoLivello}`,
      { replaceUrl: true },
    );

    await this.setupLevelProgress();
    await this.loadQuestions();
  }

  async watchAdAndDoubleReward() {
    if (this.dailyChallengeMode) {
      await this.watchAdAndDoubleDailyChallengeReward();
      return;
    }

    if (this.rewardDoubleLoading || this.rewardDoubled || this.rewardXp <= 0) {
      return;
    }

    this.rewardDoubleLoading = true;
    this.adInProgress = true;

    try {
      const user = await firstValueFrom(this.auth.user$);
      if (!user) return;

      const bonusXp = await this.quizVideoRewardService.raddoppiaXpQuizNormale(
        user.uid,
        this.rewardXp,
      );

      if (bonusXp <= 0) return;

      this.rewardXp += bonusXp;
      this.rewardDoubled = true;
    } finally {
      this.adInProgress = false;
      this.rewardDoubleLoading = false;
    }
  }

  goBack() {
    if (this.loading || !this.currentQuestion) {
      this.navigatingAway = true;
      this.goToExitPage();
      return;
    }

    this.showExitModal = true;
  }

  closeExitModal() {
    this.showExitModal = false;

    if (this.timeLeft <= 0) {
      this.showTimeModal = true;
    }
  }

  async confirmExitQuiz() {
    this.showExitModal = false;
    this.stopTimer();
    this.navigatingAway = true;

    if (this.dailyChallengeMode) {
      this.goToExitPage();
      return;
    }

    if (this.arcadeMode) {
      await this.loseArcadeLifeAndExit();
      return;
    }

    await this.livesService.spendLife();
    this.goToExitPage();
  }

  returnToEvents() {
    this.haptics.light();
    this.stopTimer();
    this.showWrongModal = false;
    this.showTimeModal = false;
    this.showExitModal = false;
    this.navigatingAway = true;
    void this.navigation.navigateByUrl('/events/challenge');
  }

  private async loseArcadeLifeAndExit() {
    const user = await firstValueFrom(this.auth.user$);

    await this.quizScalataService.registraErroreScalata(user);
    await this.livesService.spendLife();

    this.markCurrentQuestionAsWrong();
    this.showWrongModal = false;
    this.showTimeModal = false;
    this.navigatingAway = true;
    this.goToExitPage();
  }

  private startCurrentQuestion() {
    this.resetQuestionState();

    if (
      this.dailyChallengeMode &&
      !this.trackedDailyQuestionIndexes.has(this.currentIndex)
    ) {
      this.trackedDailyQuestionIndexes.add(this.currentIndex);
      void this.dailyEventsService.trackDailyChallengeQuestion();
    }

    this.startTimer();
  }

  startTimer() {
    this.stopTimer(false);
    this.audioService.playCountdownQuiz();

    this.quizAiutiTimerService.avviaTimer({
      tempoIniziale: this.timeLeft,
      onTick: ({ tempoRimasto }) => {
        this.timeLeft = tempoRimasto;
      },
      onScaduto: () => {
        this.audioService.stopGameSound();
        this.audioService.playFinishTime();
        this.timeLeft = 0;
        this.showExitModal = false;
        this.showTimeModal = true;
      },
    });
  }

  stopTimer(stopGameSound = true) {
    this.quizAiutiTimerService.fermaTimer();

    if (stopGameSound) {
      this.audioService.stopGameSound();
    }
  }

  private async finishArcadeLevel() {
    const user = await firstValueFrom(this.auth.user$);
    const risultato = await this.quizScalataService.completaLivelloScalata(
      user,
      this.displayLevelNumber,
    );

    if (!risultato) {
      this.navigatingAway = true;
      this.goToExitPage();
      return;
    }

    this.arcadeRewardCoins = risultato.premio.baseCoins;
    this.arcadeRewardXp = risultato.premio.baseXp;
    this.arcadeChestRewardCoins = risultato.premio.bonusCoins;
    this.arcadeChestRewardXp = risultato.premio.bonusXp;
    this.arcadeRewardHasBonus = risultato.premio.hasBonus;

    await this.playArcadeTransition(
      this.displayLevelNumber,
      risultato.livelloSuccessivo,
      !risultato.premio.hasBonus,
    );

    if (risultato.premio.hasBonus) {
      this.showArcadeChestRewardModal = true;
    }
  }

  async continueAfterArcadeTransition() {
    this.haptics.light();
    this.loading = true;
    this.arcadeTransitionVisible = false;
    this.arcadeTransitionReady = false;
    this.usedHelps = [];
    await this.loadQuestions();
  }

  returnToArcadeMapAfterTransition() {
    this.haptics.light();
    this.arcadeTransitionVisible = false;
    this.arcadeTransitionReady = false;
    this.navigatingAway = true;
    this.goToExitPage();
  }

  continueAfterArcadeChestReward() {
    this.haptics.heavy();
    this.showArcadeChestRewardModal = false;
    this.navigatingAway = true;
    this.goToExitPage();
  }

  private async playArcadeTransition(
    fromLevel: number,
    toLevel: number,
    waitForUserChoice: boolean,
  ) {
    this.arcadeTransitionFrom = fromLevel;
    this.arcadeTransitionTo = toLevel;
    this.arcadeTransitionReady = false;
    this.arcadeTransitionVisible = true;

    await this.wait(this.arcadeRewardHasBonus ? 1900 : 1350);

    if (waitForUserChoice) {
      this.arcadeTransitionReady = true;
      return;
    }

    this.arcadeTransitionVisible = false;
  }

  private async finishDailyChallenge() {
    const result = await this.dailyEventsService.completeDailyChallenge(
      this.correctAnswers,
      this.questions.length,
      this.usedHelps.length,
    );

    this.dailyChallengeRewardCoins = result.rewardCoins;
    this.dailyChallengeRewardAlreadyClaimed = result.alreadyClaimed;
    this.rewardDoubled = false;
    this.rewardDoubleLoading = false;
    this.rewardMessage = result.alreadyClaimed
      ? 'Sfida giornaliera completata. Il premio di oggi era già stato riscosso.'
      : `Hai completato la sfida e ottenuto ${result.rewardCoins} TurtleCoins.`;
    this.rewardUnlockedMessage =
      this.correctAnswers === this.questions.length
        ? 'Percorso perfetto'
        : `${this.correctAnswers}/${this.questions.length} risposte corrette`;
    this.showRewardModal = true;
  }

  async restartDailyChallenge() {
    if (!this.dailyChallengeMode) return;

    this.stopTimer();
    this.showWrongModal = false;
    this.showTimeModal = false;
    this.showExitModal = false;
    this.usedHelps = [];
    this.selectedAnswerIndex = null;
    this.hiddenAnswers = [];
    this.showAudienceHint = false;
    await this.loadQuestions();
  }

  private retryCurrentDailyChallengeQuestion() {
    this.resetQuestionState();
    this.startTimer();
  }

  private async watchAdAndDoubleDailyChallengeReward() {
    if (
      this.rewardDoubleLoading ||
      this.rewardDoubled ||
      this.dailyChallengeRewardCoins <= 0
    ) {
      return;
    }

    this.rewardDoubleLoading = true;
    this.adInProgress = true;

    try {
      const bonusCoins =
        await this.quizVideoRewardService.raddoppiaPremioSfidaGiornaliera();

      if (bonusCoins <= 0) return;

      this.dailyChallengeRewardCoins += bonusCoins;
      this.rewardDoubled = true;
      this.rewardMessage = `Premio raddoppiato: ${this.dailyChallengeRewardCoins} TurtleCoins.`;
    } finally {
      this.adInProgress = false;
      this.rewardDoubleLoading = false;
    }
  }

  private goToExitPage() {
    if (this.dailyChallengeMode) {
      void this.navigation.navigateByUrl('/events/challenge');
      return;
    }

    if (this.arcadeMode) {
      void this.navigation.navigateByUrl('/arcade');
      return;
    }

    void this.navigation.navigateByUrl(
      `/levels/${this.categoryId}/${this.difficultyId}`,
    );
  }

  private async switchQuestion() {
    if (this.switchingQuestion) return;

    this.switchingQuestion = true;

    try {
      const nuovaDomanda =
        await this.quizAiutiTimerService.recuperaNuovaDomanda({
          modalitaSfidaGiornaliera: this.dailyChallengeMode,
          modalitaScalata: this.arcadeMode,
          idCategoria: this.categoryId,
          idDifficolta: this.difficultyId,
          numeroLivello: this.levelNumber,
          numeroLivelloScalata: this.displayLevelNumber,
        });

      if (!nuovaDomanda) return;

      this.applicaNuovaDomanda(nuovaDomanda);
    } finally {
      this.switchingQuestion = false;
    }
  }

  // Applica una nuova domanda alla modalità corrente e riavvia lo stato della domanda.
  private applicaNuovaDomanda(nuovaDomanda: QuestionModel) {
    if (this.dailyChallengeMode) {
      this.questions[this.currentIndex] = nuovaDomanda;
      this.startCurrentQuestion();
      return;
    }

    this.questions = [nuovaDomanda];
    this.currentIndex = 0;
    this.startCurrentQuestion();
  }

  private pauseTimer() {
    this.stopTimer();
  }

  private resumeTimer() {
    if (!this.answered && !this.showTimeModal && this.currentQuestion) {
      this.startTimer();
    }
  }

  private async playHelpAnimation(helpId: HelpId) {
    this.pauseTimer();
    this.helpAnimation = helpId;
    await this.wait(1600);
    this.helpAnimation = null;
    this.resumeTimer();
  }

  ngOnDestroy() {
    this.stopTimer();
    this.appStateListener?.remove();
  }
}
