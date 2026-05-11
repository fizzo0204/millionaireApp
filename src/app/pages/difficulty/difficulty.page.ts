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
import { LivesService } from 'src/app/services/lives';
import { AdsService } from 'src/app/services/ads.service';

type DifficultyItem = {
  id: DifficultyId;
  title: string;
  subtitle: string;
  icon: string;
  xp: number;
  range: string;
  className: string;
  locked: boolean;
  completed: boolean;
};

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
  private livesService = inject(LivesService);
  private ads = inject(AdsService);
  private auth = inject(AuthService);

  categoryId = '';
  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  categoryClass = 'default';

  showNoLivesModal = false;
  lifeLoading = false;

  difficulties: DifficultyItem[] = [
    {
      id: 'easy',
      title: 'Easy',
      subtitle: 'Perfetto per iniziare!',
      icon: '⭐',
      xp: 100,
      range: '1-30',
      className: 'easy',
      locked: false,
      completed: false,
    },
    {
      id: 'medium',
      title: 'Medium',
      subtitle: 'La sfida si fa interessante!',
      icon: '🏅',
      xp: 200,
      range: '31-60',
      className: 'medium',
      locked: true,
      completed: false,
    },
    {
      id: 'hard',
      title: 'Hard',
      subtitle: 'Solo per i più preparati!',
      icon: '🔥',
      xp: 400,
      range: '61-100',
      className: 'hard',
      locked: true,
      completed: false,
    },
    {
      id: 'extreme',
      title: 'Extreme',
      subtitle: 'Il livello dei campioni!',
      icon: '👑',
      xp: 800,
      range: '100+',
      className: 'extreme',
      locked: true,
      completed: false,
    },
  ];

  ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';
    this.setupCategory();
  }

  async ionViewWillEnter() {
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

    if (!user || user.isAnonymous) {
      return;
    }

    const onlineProgress = await this.progressService.getUserCategoryProgress(
      user.uid,
      this.categoryId,
    );

    this.difficulties = this.difficulties.map((difficulty) => {
      const completed = onlineProgress.completedDifficulties.includes(
        difficulty.id,
      );

      const unlocked = this.progressService.isDifficultyUnlockedFromProgress(
        difficulty.id,
        onlineProgress.completedDifficulties,
      );

      return {
        ...difficulty,
        completed,
        locked: !unlocked,
      };
    });
  }

  goBack() {
    this.router.navigateByUrl('/home');
  }

  selectDifficulty(difficulty: DifficultyItem) {
    if (difficulty.locked) return;

    if (this.livesService.getLives() <= 0) {
      this.showNoLivesModal = true;
      return;
    }

    this.router.navigateByUrl(`/levels/${this.categoryId}/${difficulty.id}`);
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
}
