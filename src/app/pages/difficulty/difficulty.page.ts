import { Component, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { ProgressService } from 'src/app/services/progress.service';
import { DifficultyModel } from 'src/app/models/difficulty.model';
import { DIFFICULTIES } from 'src/app/data/difficulties.data';

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
