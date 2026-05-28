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

  private appStateListener?: PluginListenerHandle;

  private adInProgress = false;
  private lifeLostForLeaving = false;
  private navigatingAway = false;
  levelAlreadyCompleted = false;
  rewardDoubleLoading = false;
  rewardDoubled = false;
  dailyChallengeMode = false;
  dailyChallengeRewardCoins = 0;
  dailyChallengeRewardAlreadyClaimed = false;

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

    this.dailyChallengeMode = this.router.url
      .split('?')[0]
      .startsWith('/daily-challenge');

    if (this.dailyChallengeMode) {
      this.setupDailyChallengeLabels();
      await this.dailyEventsService.trackDailyChallengeStarted();
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
    this.difficultyLevelNumbers =
      await this.questionsService.getDifficultyLevelNumbers(
        this.categoryId,
        this.difficultyId,
      );

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

    const questionsPromise = this.dailyChallengeMode
      ? this.questionsService.getRandomActiveQuestions(
          DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount,
        )
      : this.questionsService.getQuestions(
          this.categoryId,
          this.difficultyId,
          this.levelNumber,
          1,
        );

    const [questions] = await Promise.all([questionsPromise, this.wait(1400)]);

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

    const difficulties: Record<string, string> = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      extreme: 'Extreme',
    };

    this.categoryTitle = categories[this.categoryId]?.title || 'Quiz';
    this.categoryIcon = categories[this.categoryId]?.icon || '❓';
    this.difficultyTitle = difficulties[this.difficultyId] || 'Easy';
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

  get currentQuestion(): QuestionModel | null {
    return this.questions[this.currentIndex] || null;
  }

  get progressPercent(): number {
    if (!this.questions.length) return 0;
    return ((this.currentIndex + 1) / this.questions.length) * 100;
  }

  get questionProgressLabel(): string {
    if (this.dailyChallengeMode) {
      return `Domanda ${this.currentIndex + 1}/${this.questions.length}`;
    }

    return `Domanda ${this.displayLevelNumber}/${this.totalLevels}`;
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

    const allQuestionsCorrect =
      this.questions.length > 0 &&
      this.correctAnswers === this.questions.length;

    const user = await firstValueFrom(this.auth.user$);

    if (user) {
      const levelAlreadyCompleted = await this.progressService.isLevelCompleted(
        user.uid,
        this.categoryId,
        this.difficultyId,
        this.levelNumber,
      );

      if (allQuestionsCorrect && !levelAlreadyCompleted) {
        await this.userStatsService.recordQuizResult(
          user.uid,
          this.correctAnswers,
          this.questions.length,
        );

        await this.userStatsService.recordQuizHistory(
          user.uid,
          this.categoryId,
          this.difficultyId,
          this.correctAnswers,
          this.questions.length,
        );

        await this.progressService.completeLevel(
          user.uid,
          this.categoryId,
          this.difficultyId,
          this.levelNumber,
        );
        await this.dailyEventsService.trackNormalLevelCompleted();

        const difficultyCompleted =
          await this.progressService.isDifficultyFullyCompleted(
            user.uid,
            this.categoryId,
            this.difficultyId,
          );

        if (difficultyCompleted) {
          await this.progressService.completeUserDifficulty(
            user.uid,
            this.categoryId,
            this.difficultyId,
          );
        }

        this.rewardXp =
          this.correctAnswers * USER_STATS_CONFIG.xpPerCorrectAnswer;
        this.rewardDoubled = false;
        this.rewardDoubleLoading = false;
        this.rewardMessage = `Hai completato il livello ${this.displayLevelNumber}!`;
        this.rewardUnlockedMessage = this.getRewardUnlockedMessage();
        this.showRewardModal = true;

        return;
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
    await this.livesService.spendLife();

    this.showExitModal = false;
    this.stopTimer();
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
      this.router.navigateByUrl('/events/challenge');
      return;
    }

    this.router.navigateByUrl(
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

  private async switchQuestion() {
    if (this.switchingQuestion) return;

    this.switchingQuestion = true;

    try {
      if (this.dailyChallengeMode) {
        const [newQuestion] =
          await this.questionsService.getRandomActiveQuestions(1);

        if (!newQuestion) return;

        this.questions[this.currentIndex] = newQuestion;
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
