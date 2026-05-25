import { Component, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { ProgressService } from 'src/app/services/progress.service';
import { QuestionsService } from 'src/app/services/questions.service';
import { DifficultyModel } from 'src/app/models/difficulty.model';
import { DIFFICULTIES } from 'src/app/data/difficulties.data';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

@Component({
  selector: 'app-difficulty',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './difficulty.page.html',
  styleUrls: ['./difficulty.page.scss'],
})
export class DifficultyPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private progressService = inject(ProgressService);
  private questionsService = inject(QuestionsService);
  private auth = inject(AuthService);

  @ViewChild('pageAnim') pageAnim?: ElementRef<HTMLElement>;

  categoryId = '';
  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  categoryClass = 'default';

  difficulties: DifficultyModel[] = [...DIFFICULTIES];

  ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';
    this.setupCategory();
  }

  async ionViewWillEnter() {
    this.pageAnim?.nativeElement.classList.remove('page-fade-out');

    await this.loadDifficultyProgress();
  }

  setupCategory() {
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

    const category = categories[this.categoryId];

    this.categoryTitle = category?.title || 'Quiz';
    this.categoryIcon = category?.icon || '❓';
    this.categoryClass = category?.className || 'default';
  }

  async loadDifficultyProgress() {
    const user = await firstValueFrom(this.auth.user$);

    const questionStatsEntries = await Promise.all(
      this.difficulties.map(async (difficulty) => ({
        difficultyId: difficulty.id,
        stats: await this.questionsService.getDifficultyQuestionStats(
          this.categoryId,
          difficulty.id,
        ),
      })),
    );

    const statsByDifficulty = new Map(
      questionStatsEntries.map((entry) => [entry.difficultyId, entry.stats]),
    );

    /*
     * Le card sono dinamiche: range e XP dipendono dai levelNumber attivi
     * presenti in Firestore per questa categoria e difficolta.
     */
    if (!user) {
      this.difficulties = this.difficulties.map((difficulty) => {
        const stats = statsByDifficulty.get(difficulty.id);
        const levelNumbers = stats?.levelNumbers ?? [];

        return {
          ...difficulty,
          xp: levelNumbers.length * USER_STATS_CONFIG.xpPerCorrectAnswer,
          range: this.getLevelRangeLabel(levelNumbers),
          completed: false,
          locked: difficulty.id !== 'easy',
        };
      });

      return;
    }

    // Anche l'ospite anonimo salva lo stato delle difficolta nel proprio UID.
    const completedLevelNumbersByDifficulty =
      await this.progressService.getCompletedLevelNumbersByDifficulty(
        user.uid,
        this.categoryId,
      );

    const completedByDifficulty = new Map(
      this.difficulties.map((difficulty) => {
        const stats = statsByDifficulty.get(difficulty.id);
        const levelNumbers = stats?.levelNumbers ?? [];
        const completedLevelNumbers =
          completedLevelNumbersByDifficulty[difficulty.id] ?? [];
        const completed =
          levelNumbers.length > 0 &&
          levelNumbers.every((levelNumber) =>
            completedLevelNumbers.includes(levelNumber),
          );

        return [difficulty.id, completed];
      }),
    );

    this.difficulties = this.difficulties.map((difficulty) => {
      const stats = statsByDifficulty.get(difficulty.id);
      const levelNumbers = stats?.levelNumbers ?? [];
      const completed = completedByDifficulty.get(difficulty.id) ?? false;
      const previousDifficultyId = this.getPreviousDifficultyId(difficulty.id);
      const unlocked =
        difficulty.id === 'easy' ||
        (!!previousDifficultyId &&
          completedByDifficulty.get(previousDifficultyId) === true);

      return {
        ...difficulty,
        xp: levelNumbers.length * USER_STATS_CONFIG.xpPerCorrectAnswer,
        range: this.getLevelRangeLabel(levelNumbers),
        completed,
        locked: !unlocked,
      };
    });
  }

  private getPreviousDifficultyId(
    difficultyId: DifficultyModel['id'],
  ): DifficultyModel['id'] | null {
    const order: DifficultyModel['id'][] = ['easy', 'medium', 'hard', 'extreme'];
    const currentIndex = order.indexOf(difficultyId);

    return order[currentIndex - 1] ?? null;
  }

  private getLevelRangeLabel(levelNumbers: number[]): string {
    if (levelNumbers.length === 0) return '0';

    const firstLevel = levelNumbers[0];
    const lastLevel = levelNumbers[levelNumbers.length - 1];

    return firstLevel === lastLevel
      ? `${firstLevel}`
      : `${firstLevel}-${lastLevel}`;
  }

  goBack() {
    this.animateAndNavigate('/home');
  }

  selectDifficulty(difficulty: DifficultyModel) {
    if (difficulty.locked) return;

    this.animateAndNavigate(`/levels/${this.categoryId}/${difficulty.id}`);
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
