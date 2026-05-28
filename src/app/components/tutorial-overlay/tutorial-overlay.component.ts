import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { TUTORIAL_CONFIG } from 'src/app/config/tutorial.config';
import {
  TutorialSpotlightRect,
  TutorialState,
  TutorialStep,
} from 'src/app/models/tutorial.model';
import { HapticsService } from 'src/app/services/haptics.service';
import { TutorialService } from 'src/app/services/tutorial.service';

@Component({
  selector: 'app-tutorial-overlay',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './tutorial-overlay.component.html',
  styleUrls: ['./tutorial-overlay.component.scss'],
})
export class TutorialOverlayComponent implements OnInit, OnDestroy {
  readonly state$ = this.tutorialService.state$;
  readonly steps = this.tutorialService.steps;
  readonly mascotSrc = TUTORIAL_CONFIG.mascotSrc;
  readonly rewardCoins = TUTORIAL_CONFIG.rewardCoins;
  readonly answerLetters = ['A', 'B', 'C', 'D'];

  selectedAnswerIndex: number | null = null;
  spotlightRect: TutorialSpotlightRect | null = null;
  coachPlacement: 'top' | 'bottom' = 'bottom';

  private stateSub?: Subscription;
  private routerSub?: Subscription;
  private syncToken = 0;

  constructor(
    private haptics: HapticsService,
    private router: Router,
    private tutorialService: TutorialService,
  ) {}

  ngOnInit(): void {
    this.stateSub = this.state$.subscribe((state) => {
      void this.syncStepExperience(state);
    });

    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        void this.refreshSpotlight();
      });
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
    this.routerSub?.unsubscribe();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    void this.refreshSpotlight();
  }

  getStep(state: TutorialState): TutorialStep {
    return this.steps[state.stepIndex] ?? this.steps[0];
  }

  getProgressPercent(state: TutorialState): number {
    return ((state.stepIndex + 1) / this.steps.length) * 100;
  }

  isLastStep(state: TutorialState): boolean {
    return state.stepIndex >= this.steps.length - 1;
  }

  isCoachStep(step: TutorialStep): boolean {
    return Boolean(step.targetId);
  }

  getSpotlightStyle(): Record<string, string> {
    if (!this.spotlightRect) return {};

    return {
      top: `${this.spotlightRect.top}px`,
      left: `${this.spotlightRect.left}px`,
      width: `${this.spotlightRect.width}px`,
      height: `${this.spotlightRect.height}px`,
      'border-radius': `${this.spotlightRect.radius}px`,
    };
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
    this.spotlightRect = null;
    this.tutorialService.close();
  }

  getAnswerClass(index: number, step: TutorialStep): string {
    if (this.selectedAnswerIndex === null || !step.demoQuestion) return '';

    if (index === step.demoQuestion.correctIndex) return 'correct';

    if (index === this.selectedAnswerIndex) return 'wrong';

    return '';
  }

  private async syncStepExperience(state: TutorialState): Promise<void> {
    const token = ++this.syncToken;
    const step = this.getStep(state);

    if (!state.visible || !this.isCoachStep(step)) {
      this.spotlightRect = null;
      return;
    }

    if (step.route && this.router.url.split('?')[0] !== step.route) {
      await this.router.navigateByUrl(step.route);
    }

    if (token !== this.syncToken) return;

    await this.findAndSetSpotlight(step, token);
  }

  private async refreshSpotlight(): Promise<void> {
    const state = this.tutorialService.getCurrentState();
    const step = this.getStep(state);

    if (!state.visible || !this.isCoachStep(step)) return;

    await this.findAndSetSpotlight(step, this.syncToken);
  }

  private async findAndSetSpotlight(
    step: TutorialStep,
    token: number,
  ): Promise<void> {
    if (!step.targetId) return;

    this.spotlightRect = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await this.wait(attempt === 0 ? 120 : 80);

      if (token !== this.syncToken) return;

      const target = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${step.targetId}"]`,
      );

      if (!target) continue;

      target.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });

      await this.wait(220);

      if (token !== this.syncToken) return;

      this.setSpotlightFromElement(target);
      return;
    }
  }

  private setSpotlightFromElement(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    const basePadding = 10;
    const edgeInset = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    /*
     * Manteniamo la card esattamente centrata nel riquadro. Se il target è
     * vicino a un bordo, riduciamo il padding da entrambi i lati invece di
     * tagliare solo il lato esterno.
     */
    const horizontalPadding = Math.max(
      0,
      Math.min(
        basePadding,
        rect.left - edgeInset,
        viewportWidth - rect.right - edgeInset,
      ),
    );
    const verticalPadding = Math.max(
      0,
      Math.min(
        basePadding,
        rect.top - edgeInset,
        viewportHeight - rect.bottom - edgeInset,
      ),
    );
    const top = Math.round(rect.top - verticalPadding);
    const left = Math.round(rect.left - horizontalPadding);
    const width = Math.round(rect.width + horizontalPadding * 2);
    const height = Math.round(rect.height + verticalPadding * 2);

    this.coachPlacement = top > viewportHeight * 0.42 ? 'top' : 'bottom';
    this.spotlightRect = {
      top,
      left,
      width,
      height,
      radius: Math.min(28, Math.max(18, rect.height * 0.16)),
    };
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
