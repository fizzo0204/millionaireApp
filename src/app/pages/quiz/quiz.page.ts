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
import { AdsService } from 'src/app/services/ads.service';
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
  private ads = inject(AdsService);
  private progressService = inject(ProgressService);
  private userStatsService = inject(UserStatsService);
  private auth = inject(AuthService);
  private haptics = inject(HapticsService);
  private audioService = inject(AudioService);
  private dailyEventsService = inject(DailyEventsService);
  private navigation = inject(NavigationTransitionService);
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

  private timer?: ReturnType<typeof setInterval>;
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

  // Recupera la domanda della Scalata tramite il service dedicato e aggiorna le etichette della UI.
  private async getArcadeQuestion(): Promise<QuestionModel[]> {
    const risultato = await this.quizScalataService.recuperaDomandaScalata();

    this.displayLevelNumber = risultato.numeroLivelloVisualizzato;
    this.totalLevels = risultato.totaleLivelli;

    if (!risultato.domanda) {
      return [];
    }

    this.difficultyId = risultato.idDifficolta;
    this.levelNumber = risultato.numeroLivello;
    this.difficultyTitle = this.getDifficultyTitle(risultato.idDifficolta);

    return [risultato.domanda];
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

  // Imposta le etichette iniziali della modalità Scalata usando il service dedicato.
  private async setupArcadeLabels() {
    const etichette = await this.quizScalataService.configuraEtichetteScalata();

    this.categoryId = etichette.idCategoria;
    this.categoryTitle = etichette.titoloCategoria;
    this.categoryIcon = etichette.iconaCategoria;
    this.difficultyId = etichette.idDifficolta;
    this.difficultyTitle = etichette.titoloDifficolta;
    this.levelNumber = etichette.numeroLivello;
    this.displayLevelNumber = etichette.numeroLivelloVisualizzato;
    this.totalLevels = etichette.totaleLivelli;
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
    return (this.timeLeft / this.maxTime) * 100;
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
    if (
      this.usedHelps.includes(helpId) ||
      this.answered ||
      this.showTimeModal ||
      this.showExitModal
    ) {
      return;
    }

    const help = this.helps.find((item) => item.id === helpId);
    if (!help) return;

    if (!this.coinsService.canAfford(help.cost)) {
      this.neededCoins = help.cost;
      this.stopTimer();
      this.showCoinsModal = true;
      return;
    }

    const spent = await this.coinsService.spendCoins(help.cost);
    if (!spent) return;

    this.usedHelps.push(helpId);

    if (this.dailyChallengeMode) {
      void this.dailyEventsService.trackDailyChallengeHelp();
    } else if (!this.arcadeMode) {
      void this.dailyEventsService.trackNormalHelpUsed();
    }

    await this.playHelpAnimation(helpId);

    if (helpId === 'fifty') {
      this.applyFiftyFifty();
    }

    if (helpId === 'switch') {
      await this.switchQuestion();
    }

    if (helpId === 'audience') {
      this.showAudienceHint = true;
      this.generateAudienceHint();
    }
  }

  applyFiftyFifty() {
    const question = this.currentQuestion;
    if (!question) return;

    const wrongIndexes = question.answers
      .map((_, index: number) => index)
      .filter((index: number) => index !== question.correctIndex);

    this.hiddenAnswers = wrongIndexes.slice(0, 2);
  }

  generateAudienceHint() {
    const question = this.currentQuestion;
    if (!question) return;

    this.audiencePercentages = [12, 18, 24, 16];
    this.audiencePercentages[question.correctIndex] = 50;
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

    const allQuestionsCorrect =
      this.questions.length > 0 &&
      this.correctAnswers === this.questions.length;

    const user = await firstValueFrom(this.auth.user$);

    if (user) {
      try {
        await this.dailyEventsService.trackNormalQuizPlayed();
      } catch (error) {
        console.warn('Daily event quiz played non salvato:', error);
      }

      if (allQuestionsCorrect) {
        try {
          await this.dailyEventsService.trackNormalQuizWon();
        } catch (error) {
          console.warn('Daily event quiz won non salvato:', error);
        }
      }

      if (allQuestionsCorrect && !this.levelAlreadyCompleted) {
        try {
          await this.userStatsService.recordQuizResult(
            user.uid,
            this.correctAnswers,
            this.questions.length,
          );

          await this.progressService.completeLevel(
            user.uid,
            this.categoryId,
            this.difficultyId,
            this.levelNumber,
          );

          try {
            await this.userStatsService.recordQuizHistory(
              user.uid,
              this.categoryId,
              this.difficultyId,
              this.correctAnswers,
              this.questions.length,
            );
          } catch (error) {
            console.warn('Storico quiz non salvato:', error);
          }

          try {
            await this.dailyEventsService.trackNormalLevelCompleted();
          } catch (error) {
            console.warn('Daily event livello completato non salvato:', error);
          }

          this.levelAlreadyCompleted = true;

          if (this.isLastLevelInDifficulty()) {
            const completedLevelNumbers =
              await this.progressService.getCompletedLevelNumbers(
                user.uid,
                this.categoryId,
                this.difficultyId,
              );

            const completedLevels = new Set(completedLevelNumbers);
            completedLevels.add(this.levelNumber);

            const difficultyCompleted =
              this.difficultyLevelNumbers.length > 0 &&
              this.difficultyLevelNumbers.every((levelNumber) =>
                completedLevels.has(levelNumber),
              );

            if (difficultyCompleted) {
              await this.progressService.completeUserDifficulty(
                user.uid,
                this.categoryId,
                this.difficultyId,
              );
            }
          }

          this.rewardXp =
            this.correctAnswers * USER_STATS_CONFIG.xpPerCorrectAnswer;
          this.rewardDoubled = false;
          this.rewardDoubleLoading = false;
          this.rewardMessage = `Hai completato il livello ${this.displayLevelNumber}!`;
          this.rewardUnlockedMessage = this.getRewardUnlockedMessage();
          this.showRewardModal = true;

          return;
        } catch (error) {
          console.error('Errore completamento quiz:', error);
        }
      }
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
      const reward = await this.ads.showRewardedAd();

      if (reward) {
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
      }
    } finally {
      this.adInProgress = false;
    }
  }

  async watchAdForMoreTime() {
    this.adInProgress = true;

    try {
      const reward = await this.ads.showRewardedAd();

      if (reward) {
        this.showTimeModal = false;
        this.answered = false;
        this.isCorrect = false;
        this.selectedAnswerIndex = null;
        this.timeLeft = 5;
        this.startTimer();
      }
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
      const reward = await this.ads.showRewardedAd();

      if (reward) {
        await this.coinsService.addCoins(10);
      }

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

  continueAfterReward() {
    this.haptics.heavy();
    this.showRewardModal = false;
    this.navigatingAway = true;

    this.goToExitPage();
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
      const reward = await this.ads.showRewardedAd();

      if (!reward) return;

      const user = await firstValueFrom(this.auth.user$);

      if (!user) return;

      const bonusXp = this.rewardXp;

      await this.userStatsService.addXp(user.uid, bonusXp);

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

    if (this.dailyChallengeMode || this.arcadeMode) {
      this.goToExitPage();
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

  // Nella Scalata registra l'errore, consuma una vita e torna alla mappa.
  private async loseArcadeLifeAndExit() {
    await this.quizScalataService.registraErroreScalata();

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

    this.timer = setInterval(() => {
      this.timeLeft--;

      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.audioService.playFinishTime();
        this.timeLeft = 0;
        this.showExitModal = false;
        this.showTimeModal = true;
      }
    }, 1000);
  }

  stopTimer(stopGameSound = true) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    if (stopGameSound) {
      this.audioService.stopGameSound();
    }
  }

  // Registra il completamento del livello Scalata e prepara premi/transizione.
  private async finishArcadeLevel() {
    const risultato = await this.quizScalataService.concludiLivelloScalata(
      this.displayLevelNumber,
    );

    if (!risultato.success || !risultato.reward || !risultato.prossimoLivello) {
      this.navigatingAway = true;
      this.goToExitPage();
      return;
    }

    const reward = risultato.reward;

    this.arcadeRewardCoins = reward.baseCoins;
    this.arcadeRewardXp = reward.baseXp;
    this.arcadeChestRewardCoins = reward.bonusCoins;
    this.arcadeChestRewardXp = reward.bonusXp;
    this.arcadeRewardHasBonus = reward.hasBonus;

    await this.playArcadeTransition(
      this.displayLevelNumber,
      risultato.prossimoLivello,
      !reward.hasBonus,
    );

    if (reward.hasBonus) {
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
      const reward = await this.ads.showRewardedAd();

      if (!reward) return;

      const bonusCoins =
        await this.dailyEventsService.doubleDailyChallengeReward();

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

  private getRewardUnlockedMessage(): string {
    const currentLevelIndex = this.difficultyLevelNumbers.indexOf(
      this.levelNumber,
    );
    const nextDisplayLevel = currentLevelIndex + 2;

    if (
      currentLevelIndex >= 0 &&
      nextDisplayLevel <= this.difficultyLevelNumbers.length
    ) {
      return `Livello ${nextDisplayLevel} sbloccato`;
    }

    return 'Difficolta completata';
  }

  private isLastLevelInDifficulty(): boolean {
    if (this.difficultyLevelNumbers.length === 0) return false;

    return (
      this.difficultyLevelNumbers[this.difficultyLevelNumbers.length - 1] ===
      this.levelNumber
    );
  }

  private async switchQuestion() {
    if (this.switchingQuestion) return;

    this.switchingQuestion = true;

    try {
      if (this.dailyChallengeMode) {
        const [newQuestion] =
          await this.questionsService.getRandomActiveQuestions(
            1,
            DAILY_EVENTS_CONFIG.dailyChallengeDifficulty,
          );

        if (!newQuestion) return;

        this.questions[this.currentIndex] = newQuestion;
        this.startCurrentQuestion();
        return;
      }

      if (this.arcadeMode) {
        const selection = await this.questionsService.getArcadeQuestionForLevel(
          this.displayLevelNumber,
        );

        if (!selection) return;

        this.questions = [selection.question];
        this.currentIndex = 0;
        this.startCurrentQuestion();
        return;
      }

      const newQuestions = await this.questionsService.getQuestions(
        this.categoryId,
        this.difficultyId,
        this.levelNumber,
        1,
      );

      if (newQuestions.length === 0) return;

      this.questions = newQuestions;
      this.currentIndex = 0;

      this.startCurrentQuestion();
    } finally {
      this.switchingQuestion = false;
    }
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
