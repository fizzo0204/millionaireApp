import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from 'src/app/services/auth.service';
import {
  DifficultyId,
  ProgressService,
} from 'src/app/services/progress.service';

type LevelItem = {
  number: number;
  locked: boolean;
  completed: boolean;
};

@Component({
  selector: 'app-levels',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './levels.page.html',
  styleUrls: ['./levels.page.scss'],
})
export class LevelsPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private progressService = inject(ProgressService);

  categoryId = '';
  difficultyId: DifficultyId = 'easy';

  levels: LevelItem[] = [];

  ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';

    this.difficultyId =
      (this.route.snapshot.paramMap.get('difficultyId') as DifficultyId) ||
      'easy';

    this.generateLevels();
  }

  async ionViewWillEnter() {
    await this.loadLevelProgress();
  }

  generateLevels() {
    let numbers: number[] = [];

    if (this.difficultyId === 'easy') {
      numbers = Array.from({ length: 30 }, (_, i) => i + 1);
    }

    if (this.difficultyId === 'medium') {
      numbers = Array.from({ length: 30 }, (_, i) => i + 31);
    }

    if (this.difficultyId === 'hard') {
      numbers = Array.from({ length: 40 }, (_, i) => i + 61);
    }

    if (this.difficultyId === 'extreme') {
      numbers = Array.from({ length: 50 }, (_, i) => i + 101);
    }

    this.levels = numbers.map((number, index) => ({
      number,
      locked: index !== 0,
      completed: false,
    }));
  }

  async loadLevelProgress() {
    const user = await firstValueFrom(this.auth.user$);

    if (!user || user.isAnonymous) return;

    const completedLevelNumbers =
      await this.progressService.getCompletedLevelNumbers(
        user.uid,
        this.categoryId,
        this.difficultyId,
      );

    this.levels = this.levels.map((level, index) => {
      const completed = completedLevelNumbers.includes(level.number);

      const previousLevel = this.levels[index - 1];

      const unlocked =
        index === 0 || completedLevelNumbers.includes(previousLevel.number);

      return {
        ...level,
        completed,
        locked: !unlocked,
      };
    });
  }

  openLevel(level: LevelItem) {
    if (level.locked) return;

    this.router.navigateByUrl(
      `/quiz/${this.categoryId}/${this.difficultyId}/${level.number}`,
    );
  }

  goBack() {
    this.router.navigateByUrl(`/difficulty/${this.categoryId}`);
  }
}
