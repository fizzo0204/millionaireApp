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

  private appStateListener?: PluginListenerHandle;
  private adInProgress = false;
  private lifeLostForLeaving = false;
  private navigatingAway = false;

  categoryId = '';
  difficultyId: DifficultyId = 'easy';
  levelNumber = 1;
  displayLevelNumber = 1;
  totalLevels = 30;
  levelAlreadyCompleted = false;

  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  difficultyTitle = 'Easy';

  questions: QuestionModel[] = [];
  currentIndex = 0;

  correctAnswers = 0;
  wrongAnswers = 0;

  selectedAnswerIndex: number | null = null;

  hiddenAnswers: number[] = [];
  usedHelps: HelpId[] = [];

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
  helpAnimation: HelpId | null = null;

  rewardXp = 0;
  rewardMessage = '';
  rewardUnlockedMessage = '';
  neededCoins = 0;
  coins$ = this.coinsService.coins$;
  lives$ = this.livesService.lives$;

  timeLeft = 15;
  readonly maxTime = 15;
  private timer?: ReturnType<typeof setInterval>;

  helps: HelpModel[] = [...HELPS];

  audiencePercentages = [15, 20, 50, 15];

  async ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';
    this.difficultyId =
      (this.route.snapshot.paramMap.get('difficultyId') as DifficultyId) ||
      'easy';
    this.levelNumber = Number(
      this.route.snapshot.paramMap.get('levelNumber') || 1,
    );

    this.setupLevelProgress();

    this.setupLabels();
    await this.listenToAppState();
    await this.loadQuestions();
  }

  private setupLevelProgress() {
    if (this.difficultyId === 'easy') {
      this.displayLevelNumber = this.levelNumber;
      this.totalLevels = 30;
    }

    if (this.difficultyId === 'medium') {
      this.displayLevelNumber = this.levelNumber - 30;
      this.totalLevels = 30;
    }

    if (this.difficultyId === 'hard') {
      this.displayLevelNumber = this.levelNumber - 60;
      this.totalLevels = 40;
    }

    if (this.difficultyId === 'extreme') {
      this.displayLevelNumber = this.levelNumber - 100;
      this.totalLevels = 50;
    }
  }

  ionViewWillLeave() {
    this.stopTimer();
  }

  async loadQuestions() {
    this.loading = true;

    const [questions] = await Promise.all([
      this.questionsService.getQuestions(
        this.categoryId,
        this.difficultyId,
        this.levelNumber,
        1,
      ),
      this.wait(1400),
    ]);

    this.questions = questions;

    this.loading = false;

    this.currentIndex = 0;
    this.correctAnswers = 0;
    this.wrongAnswers = 0;

    if (this.questions.length === 0) {
      this.stopTimer();
      return;
    }

    this.resetQuestionState();
    this.startTimer();
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
    this.goToLevelsPage();
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

  get currentQuestion(): QuestionModel | null {
    return this.questions[this.currentIndex] || null;
  }

  get progressPercent(): number {
    if (!this.questions.length) return 0;
    return ((this.currentIndex + 1) / this.questions.length) * 100;
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

      setTimeout(() => {
        this.nextQuestion();
      }, 700);

      return;
    }

    this.wrongAnswers++;
    this.haptics.error();

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
    this.resetQuestionState();
    this.startTimer();
  }

  async finishQuiz() {
    const allQuestionsCorrect =
      this.questions.length > 0 &&
      this.correctAnswers === this.questions.length;

    const user = await firstValueFrom(this.auth.user$);

    if (user && !user.isAnonymous) {
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

        this.rewardXp = this.correctAnswers * 10;
        this.rewardMessage = `Hai completato il livello ${this.levelNumber}!`;
        this.rewardUnlockedMessage = `Livello ${this.levelNumber + 1} sbloccato`;
        this.showRewardModal = true;

        return;
      }
    }

    this.navigatingAway = true;
    this.goToLevelsPage();
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

    this.goToLevelsPage();
  }

  goBack() {
    if (this.loading || !this.currentQuestion) {
      this.navigatingAway = true;
      this.goToLevelsPage();
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
    this.goToLevelsPage();
  }

  startTimer() {
    this.stopTimer();

    this.timer = setInterval(() => {
      this.timeLeft--;

      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.timeLeft = 0;
        this.showExitModal = false;
        this.showTimeModal = true;
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private goToLevelsPage() {
    this.router.navigateByUrl(
      `/levels/${this.categoryId}/${this.difficultyId}`,
    );
  }

  private async switchQuestion() {
    if (this.switchingQuestion) return;

    this.switchingQuestion = true;

    try {
      const newQuestions = await this.questionsService.getQuestions(
        this.categoryId,
        this.difficultyId,
        this.levelNumber,
        1,
      );

      if (newQuestions.length === 0) return;

      this.questions = newQuestions;
      this.currentIndex = 0;

      this.resetQuestionState();
      this.startTimer();
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
