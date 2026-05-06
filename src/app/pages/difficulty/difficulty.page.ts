import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';

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

  categoryId = '';
  categoryTitle = 'Quiz';
  categoryIcon = '❓';
  categoryClass = 'default';

  difficulties = [
    {
      id: 'easy',
      title: 'Easy',
      subtitle: 'Perfetto per iniziare!',
      icon: '⭐',
      xp: 100,
      range: '1-30',
      className: 'easy',
    },
    {
      id: 'medium',
      title: 'Medium',
      subtitle: 'La sfida si fa interessante!',
      icon: '🏅',
      xp: 200,
      range: '31-60',
      className: 'medium',
    },
    {
      id: 'hard',
      title: 'Hard',
      subtitle: 'Solo per i più preparati!',
      icon: '🔥',
      xp: 400,
      range: '61-100',
      className: 'hard',
    },
    {
      id: 'extreme',
      title: 'Extreme',
      subtitle: 'Il livello dei campioni!',
      icon: '👑',
      xp: 800,
      range: '100+',
      className: 'extreme',
    },
  ];

  ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';
    this.setupCategory();
  }

  setupCategory() {
    const categories: Record<
      string,
      {
        title: string;
        icon: string;
        className: string;
      }
    > = {
      sport: {
        title: 'Sport',
        icon: '⚽',
        className: 'sport',
      },
      cinema: {
        title: 'Cinema',
        icon: '🎬',
        className: 'cinema',
      },
      storia: {
        title: 'Storia',
        icon: '🏛️',
        className: 'storia',
      },
      geografia: {
        title: 'Geografia',
        icon: '🌍',
        className: 'geografia',
      },
      scienza: {
        title: 'Scienze',
        icon: '🔬',
        className: 'scienza',
      },
      musica: {
        title: 'Musica',
        icon: '🎵',
        className: 'musica',
      },
      tecnologia: {
        title: 'Tecnologia',
        icon: '💡',
        className: 'tecnologia',
      },
      altro: {
        title: 'Altro',
        icon: '⭐',
        className: 'altro',
      },
    };

    const category = categories[this.categoryId];

    this.categoryTitle = category?.title || 'Quiz';
    this.categoryIcon = category?.icon || '❓';
    this.categoryClass = category?.className || 'default';
  }

  goBack() {
    this.router.navigateByUrl('/home');
  }

  selectDifficulty(difficultyId: string) {
    console.log('Categoria:', this.categoryId);
    console.log('Difficoltà:', difficultyId);
  }
}
