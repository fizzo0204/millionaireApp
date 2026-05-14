import { Component, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LivesService } from 'src/app/services/lives';
import { AuthService } from 'src/app/services/auth.service';
import {
  DifficultyId,
  ProgressService,
} from 'src/app/services/progress.service';
import { AdsService } from 'src/app/services/ads.service';

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
  private livesService = inject(LivesService);
  private ads = inject(AdsService);

  @ViewChild('pageAnim') pageAnim?: ElementRef<HTMLElement>;

  categoryId = '';
  difficultyId: DifficultyId = 'easy';

  levels: LevelItem[] = [];
  showNoLivesModal = false;
  lifeLoading = false;
  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  categoryClass = 'default';
  difficultyTitle = 'Easy';

  ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';

    this.difficultyId =
      (this.route.snapshot.paramMap.get('difficultyId') as DifficultyId) ||
      'easy';

    this.setupLabels();

    this.generateLevels();
  }

  async ionViewWillEnter() {
    this.pageAnim?.nativeElement.classList.remove('page-fade-out');

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

    if (this.livesService.getLives() <= 0) {
      this.showNoLivesModal = true;
      return;
    }

    this.animateAndNavigate(
      `/quiz/${this.categoryId}/${this.difficultyId}/${level.number}`,
    );
  }

  closeNoLivesModal() {
    if (this.lifeLoading) return;
    this.showNoLivesModal = false;
  }

  async watchAdForLife() {
    if (this.lifeLoading) return;

    this.lifeLoading = true;

    const reward = await this.ads.showRewardedAd();

    if (reward) {
      await this.livesService.addLife(1);
      this.showNoLivesModal = false;
    }

    this.lifeLoading = false;
  }

  goBack() {
    this.animateAndNavigate(`/difficulty/${this.categoryId}`);
  }

  setupLabels() {
    const categories: Record<
      string,
      { title: string; icon: string; className: string }
    > = {
      sport: { title: 'Sport', icon: '⚽', className: 'sport' },
      cinema: { title: 'Cinema', icon: '🎬', className: 'cinema' },
      storia: { title: 'Storia', icon: '🏛️', className: 'storia' },
      geografia: { title: 'Geografia', icon: '🌍', className: 'geografia' },
      scienza: { title: 'Scienze', icon: '🔬', className: 'scienza' },
      musica: { title: 'Musica', icon: '🎵', className: 'musica' },
      tecnologia: { title: 'Tecnologia', icon: '💡', className: 'tecnologia' },
      altro: { title: 'Altro', icon: '⭐', className: 'altro' },
    };

    const difficulties: Record<DifficultyId, { title: string; icon: string }> =
      {
        easy: { title: 'Easy', icon: '⭐' },
        medium: { title: 'Medium', icon: '🏅' },
        hard: { title: 'Hard', icon: '🔥' },
        extreme: { title: 'Extreme', icon: '👑' },
      };

    const category = categories[this.categoryId];
    const difficulty = difficulties[this.difficultyId];

    this.categoryTitle = category?.title || 'Quiz';
    this.categoryIcon = category?.icon || '❓';
    this.categoryClass = category?.className || 'default';

    this.difficultyTitle = difficulty?.title || 'Easy';
  }

  private animateAndNavigate(url: string) {
    const el = this.pageAnim?.nativeElement;

    el?.classList.remove('page-fade-out');
    void el?.offsetWidth;
    el?.classList.add('page-fade-out');

    setTimeout(() => {
      this.router.navigateByUrl(url);
    }, 160);
  }
}
