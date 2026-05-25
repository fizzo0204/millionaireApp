import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { TUTORIAL_CONFIG } from 'src/app/config/tutorial.config';
import { TutorialState, TutorialStep } from 'src/app/models/tutorial.model';
import { HapticsService } from 'src/app/services/haptics.service';
import { TutorialService } from 'src/app/services/tutorial.service';

@Component({
  selector: 'app-tutorial-overlay',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './tutorial-overlay.component.html',
  styleUrls: ['./tutorial-overlay.component.scss'],
})
export class TutorialOverlayComponent {
  readonly state$ = this.tutorialService.state$;
  readonly steps = this.tutorialService.steps;
  readonly mascotSrc = TUTORIAL_CONFIG.mascotSrc;
  readonly rewardCoins = TUTORIAL_CONFIG.rewardCoins;
  readonly answerLetters = ['A', 'B', 'C', 'D'];

  selectedAnswerIndex: number | null = null;

  constructor(
    private haptics: HapticsService,
    private tutorialService: TutorialService,
  ) {}

  getStep(state: TutorialState): TutorialStep {
    return this.steps[state.stepIndex] ?? this.steps[0];
  }

  getProgressPercent(state: TutorialState): number {
    return ((state.stepIndex + 1) / this.steps.length) * 100;
  }

  isLastStep(state: TutorialState): boolean {
    return state.stepIndex >= this.steps.length - 1;
  }

  canContinue(state: TutorialState): boolean {
    const step = this.getStep(state);

    if (state.loading) return false;
    if (state.completed) return true;

    if (step.kind !== 'demo-question') return true;

    return this.selectedAnswerIndex === step.demoQuestion?.correctIndex;
  }

  selectDemoAnswer(index: number, step: TutorialStep): void {
    if (!step.demoQuestion) return;

    this.selectedAnswerIndex = index;

    if (index === step.demoQuestion.correctIndex) {
      void this.haptics.success();
      return;
    }

    void this.haptics.error();
  }

  async continue(state: TutorialState): Promise<void> {
    if (!this.canContinue(state)) return;

    if (state.completed) {
      this.close();
      return;
    }

    if (this.isLastStep(state)) {
      await this.tutorialService.completeTutorial();
      return;
    }

    this.selectedAnswerIndex = null;
    this.tutorialService.nextStep();
    void this.haptics.light();
  }

  back(): void {
    this.selectedAnswerIndex = null;
    this.tutorialService.previousStep();
    void this.haptics.light();
  }

  async skip(): Promise<void> {
    await this.tutorialService.skip();
  }

  close(): void {
    this.selectedAnswerIndex = null;
    this.tutorialService.close();
  }

  getAnswerClass(index: number, step: TutorialStep): string {
    if (this.selectedAnswerIndex === null || !step.demoQuestion) return '';

    if (index === step.demoQuestion.correctIndex) return 'correct';

    if (index === this.selectedAnswerIndex) return 'wrong';

    return '';
  }
}
