import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

import { ProgressService } from 'src/app/services/progress.service';
import {
  QuestionsService,
  QuizQuestion,
} from 'src/app/services/questions.service';
import { CoinsService } from 'src/app/services/coins.service';
import { LivesService } from 'src/app/services/lives';
import { AdsService } from 'src/app/services/ads.service';
import { GameLoaderComponent } from 'src/app/components/game-loader/game-loader.component';

type HelpId = 'fifty' | 'switch' | 'audience';

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

  private appStateListener?: PluginListenerHandle;
  private adInProgress = false;
  private lifeLostForLeaving = false;
  private navigatingAway = false;

  categoryId = '';
  difficultyId = '';

  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  difficultyTitle = 'Easy';

  questions: QuizQuestion[] = [];
  currentIndex = 0;

  correctAnswers = 0;
  wrongAnswers = 0;

  loading = true;
  selectedAnswerIndex: number | null = null;
  answered = false;
  isCorrect = false;

  hiddenAnswers: number[] = [];
  usedHelps: HelpId[] = [];

  showWrongModal = false;
  showTimeModal = false;
  showCoinsModal = false;
  showAudienceHint = false;
  showExitModal = false;

  neededCoins = 0;
  coins$ = this.coinsService.coins$;
  lives$ = this.livesService.lives$;

  timeLeft = 20;
  readonly maxTime = 20;
  private timer?: ReturnType<typeof setInterval>;

  helps = [
    { id: 'fifty' as HelpId, icon: '50:50', title: '50 / 50', cost: 20 },
    { id: 'switch' as HelpId, icon: '🔄', title: 'Cambia domanda', cost: 30 },
    {
      id: 'audience' as HelpId,
      icon: '👥',
      title: 'Chiedi al pubblico',
      cost: 25,
    },
  ];

  audiencePercentages = [15, 20, 50, 15];

  async ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';
    this.difficultyId = this.route.snapshot.paramMap.get('difficultyId') || '';

    this.setupLabels();
    await this.listenToAppState();
    await this.loadQuestions();
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
        10,
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
    this.router.navigateByUrl(`/difficulty/${this.categoryId}`);
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

  get currentQuestion(): QuizQuestion | null {
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
      return;
    }

    this.wrongAnswers++;

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
      this.showCoinsModal = true;
      return;
    }

    const spent = await this.coinsService.spendCoins(help.cost);
    if (!spent) return;

    this.usedHelps.push(helpId);

    if (helpId === 'fifty') {
      this.applyFiftyFifty();
    }

    if (helpId === 'switch') {
      this.markCurrentQuestionAsWrong();
      this.nextQuestion();
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
      .map((_, index) => index)
      .filter((index) => index !== question.correctIndex);

    this.hiddenAnswers = wrongIndexes.slice(0, 2);
  }

  generateAudienceHint() {
    const question = this.currentQuestion;
    if (!question) return;

    this.audiencePercentages = [12, 18, 24, 16];
    this.audiencePercentages[question.correctIndex] = 50;
  }

  async nextQuestion() {
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

    if (allQuestionsCorrect) {
      await this.progressService.completeDifficulty(
        this.categoryId,
        this.difficultyId as any,
      );
    }

    this.navigatingAway = true;
    this.router.navigateByUrl(`/difficulty/${this.categoryId}`);
  }

  markCurrentQuestionAsWrong() {
    if (this.answered) return;

    this.answered = true;
    this.isCorrect = false;
    this.wrongAnswers++;
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
        this.nextQuestion();
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
        this.timeLeft = 10;
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
    } finally {
      this.adInProgress = false;
    }
  }

  closeCoinsModal() {
    this.showCoinsModal = false;
  }

  goBack() {
    if (this.loading || !this.currentQuestion) {
      this.navigatingAway = true;
      this.router.navigateByUrl(`/difficulty/${this.categoryId}`);
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
    this.router.navigateByUrl(`/difficulty/${this.categoryId}`);
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

  ngOnDestroy() {
    this.stopTimer();
    this.appStateListener?.remove();
  }
}
