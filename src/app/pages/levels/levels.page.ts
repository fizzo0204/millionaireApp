import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LivesService } from 'src/app/services/lives';
import { AuthService } from 'src/app/services/auth.service';
import { ProgressService } from 'src/app/services/progress.service';
import { QuestionsService } from 'src/app/services/questions.service';
import { AdsService } from 'src/app/services/ads.service';
import { LevelModel } from 'src/app/models/level.model';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

@Component({
  selector: 'app-levels',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './levels.page.html',
  styleUrls: ['./levels.page.scss'],
})
export class LevelsPage {
  private route = inject(ActivatedRoute);
  private navigation = inject(NavigationTransitionService);
  private auth = inject(AuthService);
  private progressService = inject(ProgressService);
  private questionsService = inject(QuestionsService);
  private livesService = inject(LivesService);
  private ads = inject(AdsService);

  categoryId = '';
  difficultyId: DifficultyId = 'easy';
  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  categoryClass = 'default';
  difficultyTitle = 'Easy';

  levels: LevelModel[] = [];
  previousCompletedLevelNumbers: number[] = [];

  showNoLivesModal = false;
  lifeLoading = false;

  ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';

    this.difficultyId =
      (this.route.snapshot.paramMap.get('difficultyId') as DifficultyId) ||
      'easy';

    this.setupLabels();
  }

  async ionViewWillEnter() {
    await this.generateLevels();
    await this.loadLevelProgress();
  }

  async generateLevels() {
    const numbers = await this.questionsService.getDifficultyLevelNumbers(
      this.categoryId,
      this.difficultyId,
    );

    this.levels = numbers.map((number, index) => ({
      number,
      locked: index !== 0,
      completed: false,
    }));
  }

  async loadLevelProgress() {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) return;

    // L'ospite anonimo ha livelli completati salvati come ogni altro profilo.
    const completedLevelNumbers =
      await this.progressService.getCompletedLevelNumbers(
        user.uid,
        this.categoryId,
        this.difficultyId,
      );

    this.levels = this.levels.map((level, index) => {
      const completed = completedLevelNumbers.includes(level.number);

      const wasCompletedBefore = this.previousCompletedLevelNumbers.includes(
        level.number,
      );

      const justCompleted = completed && !wasCompletedBefore;

      const previousLevel = this.levels[index - 1];

      const unlocked =
        index === 0 || completedLevelNumbers.includes(previousLevel.number);

      return {
        ...level,
        completed,
        locked: !unlocked,
        justCompleted,
      };
    });

    this.previousCompletedLevelNumbers = [...completedLevelNumbers];

    setTimeout(() => {
      this.levels = this.levels.map((level) => ({
        ...level,
        justCompleted: false,
      }));
    }, 1400);
  }

  openLevel(level: LevelModel) {
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
    void this.navigation.navigateByUrl(url);
  }

  get firstPlayableLevel(): number {
    const next = this.levels.find((level) => !level.locked && !level.completed);

    return next?.number ?? -1;
  }
}
