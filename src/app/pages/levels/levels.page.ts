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
import { GameLoaderComponent } from 'src/app/components/game-loader/game-loader.component';

@Component({
  selector: 'app-levels',
  standalone: true,
  imports: [CommonModule, IonicModule, GameLoaderComponent],
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
  caricamentoLivelli = true;

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
    await this.caricaLivelliConProgressi();
  }

  /**
   * Carica numeri livelli e progressi in un unico passaggio.
   * La griglia resta nascosta finché non abbiamo dati completi, così evitiamo
   * il flash iniziale della card livello 1 non ancora aggiornata.
   */
  async caricaLivelliConProgressi() {
    this.caricamentoLivelli = true;

    try {
      const caricamentoMinimo = this.attendiCaricamentoMinimoLivelli();
      const user = await firstValueFrom(this.auth.user$);

      const [numbers, completedLevelNumbers] = await Promise.all([
        this.questionsService.getDifficultyLevelNumbers(
          this.categoryId,
          this.difficultyId,
        ),
        user
          ? this.progressService.getCompletedLevelNumbers(
              user.uid,
              this.categoryId,
              this.difficultyId,
            )
          : Promise.resolve([] as number[]),
        caricamentoMinimo,
      ]);

      this.levels = numbers.map((number, index) => {
        const completed = completedLevelNumbers.includes(number);

        const wasCompletedBefore =
          this.previousCompletedLevelNumbers.includes(number);

        const justCompleted = completed && !wasCompletedBefore;
        const previousLevelNumber = numbers[index - 1];

        const unlocked =
          index === 0 || completedLevelNumbers.includes(previousLevelNumber);

        return {
          number,
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
    } finally {
      this.caricamentoLivelli = false;
    }
  }

  /**
   * Mantiene visibile il loader per un tempo minimo.
   * Così evitiamo l'effetto flash quando Firebase risponde molto velocemente.
   */
  private attendiCaricamentoMinimoLivelli(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  /**
   * Compatibilità: se qualche punto della pagina richiama ancora generateLevels,
   * ora usiamo il caricamento completo per evitare stati intermedi.
   */
  async generateLevels() {
    await this.caricaLivelliConProgressi();
  }

  /**
   * Compatibilità: mantiene il vecchio nome, ma non aggiorna più la griglia
   * separatamente dai livelli per evitare il flash visivo.
   */
  async loadLevelProgress() {
    await this.caricaLivelliConProgressi();
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

  goBackNoLevel() {
    this.animateAndNavigate('/home?view=categories');
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
