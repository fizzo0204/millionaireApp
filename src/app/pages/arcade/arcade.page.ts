import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ARCADE_CONFIG } from 'src/app/config/arcade.config';
import { GameLoaderComponent } from 'src/app/components/game-loader/game-loader.component';
import { AuthService } from 'src/app/services/auth.service';
import { QuestionsService } from 'src/app/services/questions.service';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { UserArcadeData } from 'src/app/models/user-stats.model';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

interface ArcadeMapLevel {
  level: number;
  state: 'completed' | 'current' | 'locked';
}

@Component({
  selector: 'app-arcade',
  standalone: true,
  imports: [CommonModule, IonicModule, GameLoaderComponent],
  templateUrl: './arcade.page.html',
  styleUrls: ['./arcade.page.scss'],
})
export class ArcadePage {
  loading = true;
  arcade: UserArcadeData = this.userStatsService.defaultArcade;
  totalLevels = 0;
  visibleLevels: ArcadeMapLevel[] = [];

  constructor(
    private auth: AuthService,
    private navigation: NavigationTransitionService,
    private questionsService: QuestionsService,
    private userStatsService: UserStatsService,
  ) {}

  async ionViewWillEnter() {
    await this.loadArcadeMap();
  }

  async loadArcadeMap() {
    this.loading = true;

    const user = await firstValueFrom(this.auth.user$);
    this.arcade = user
      ? await this.userStatsService.getArcadeData(user.uid)
      : this.userStatsService.defaultArcade;
    this.totalLevels = await this.questionsService.getArcadeTotalLevels();
    this.visibleLevels = this.buildVisibleLevels();
    this.loading = false;
  }

  get currentLevel(): number {
    return this.arcade.currentLevel ?? 1;
  }

  get bestLevel(): number {
    return this.arcade.bestLevel ?? 1;
  }

  get segmentStart(): number {
    return (
      Math.floor((Math.max(this.currentLevel, 1) - 1) / ARCADE_CONFIG.bonusEveryLevels) *
        ARCADE_CONFIG.bonusEveryLevels +
      1
    );
  }

  get nextChestLevel(): number {
    return this.segmentStart + ARCADE_CONFIG.bonusEveryLevels - 1;
  }

  get completedInSegment(): number {
    return (Math.max(this.currentLevel, 1) - 1) % ARCADE_CONFIG.bonusEveryLevels;
  }

  get chestProgressLabel(): string {
    return `${this.completedInSegment}/${ARCADE_CONFIG.bonusEveryLevels}`;
  }

  get canPlayCurrentLevel(): boolean {
    return this.totalLevels > 0 && this.currentLevel <= this.totalLevels;
  }

  get chestSteps(): number[] {
    return Array.from(
      { length: ARCADE_CONFIG.bonusEveryLevels },
      (_, index) => index + 1,
    );
  }

  isChestStepFilled(step: number): boolean {
    return step <= this.completedInSegment;
  }

  startCurrentLevel() {
    if (!this.canPlayCurrentLevel) return;

    this.loading = true;
    void this.navigation.navigateByUrl('/arcade/play');
  }

  goHome() {
    void this.navigation.navigateByUrl('/home');
  }

  private buildVisibleLevels(): ArcadeMapLevel[] {
    const fallbackEnd = this.segmentStart + ARCADE_CONFIG.bonusEveryLevels - 1;
    const segmentEnd = Math.min(
      this.totalLevels || fallbackEnd,
      fallbackEnd,
    );

    return Array.from(
      { length: Math.max(0, segmentEnd - this.segmentStart + 1) },
      (_, index) => {
        const level = this.segmentStart + index;

        return {
          level,
          state:
            level < this.currentLevel
              ? 'completed'
              : level === this.currentLevel
                ? 'current'
                : 'locked',
        };
      },
    );
  }
}
