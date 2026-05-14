import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { User } from 'firebase/auth';
import { map, Observable, of, switchMap } from 'rxjs';
import {
  UserStatsService,
  AppUserProfile,
  QuizHistoryItem,
} from 'src/app/services/user-stats.service';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage {
  user$: Observable<User | null> = this.auth.user$;
  profile$: Observable<AppUserProfile | undefined> = this.user$.pipe(
    switchMap((user) => {
      if (!user || user.isAnonymous) {
        return of(undefined);
      }

      return this.userStatsService.getUserProfile(user.uid);
    }),
  );

  readonly profileStats$ = this.profile$.pipe(
    map((profile) => profile?.stats ?? this.userStatsService.defaultStats),
  );

  recentResults$: Observable<QuizHistoryItem[]> = this.user$.pipe(
    switchMap((user) => {
      if (!user || user.isAnonymous) {
        return of([]);
      }

      return this.userStatsService.getRecentQuizHistory(user.uid, 5);
    }),
  );

  joinDate = this.getJoinDate();

  selectedAvatar = localStorage.getItem('profile_avatar') || 'letter';
  tempSelectedAvatar = this.selectedAvatar;

  showAvatarModal = false;
  showAchievementsModal = false;

  avatars = [
    { id: 'letter', label: 'Iniziale', minLevel: 1 },
    { id: 'crown', label: 'Corona', icon: '👑', minLevel: 3 },
    { id: 'brain', label: 'Genio', icon: '🧠', minLevel: 5 },
    { id: 'trophy', label: 'Campione', icon: '🏆', minLevel: 10 },
  ];

  get allAvatars() {
    const dailyAvatars = this.dailyRewardService
      .getUnlockedAvatars()
      .map((avatar) => ({
        id: avatar.id,
        label: avatar.label,
        icon: this.getDailyAvatarIcon(avatar.id, avatar.icon),
        minLevel: 1,
        source: 'daily',
        rarity: avatar.rarity,
      }));

    return [...this.avatars, ...dailyAvatars];
  }

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
    private dailyRewardService: DailyRewardService,
  ) {}

  private getDailyAvatarIcon(id: string, fallbackIcon: string): string {
    const icons: Record<string, string> = {
      daily_turtle_gold: '🐢',
      daily_fire_brain: '🔥',
      daily_neon_star: '🌟',
      daily_crown_legend: '👑',
    };

    return icons[id] || fallbackIcon;
  }

  getXpPercent(xp: number): number {
    return Math.min(100, Math.round((xp / this.maxXp) * 100));
  }

  get maxXp(): number {
    return 1000;
  }

  getTitle(level: number): string {
    if (level >= 10) return 'Leggenda del Quiz';
    if (level >= 7) return 'Quiz Master';
    if (level >= 4) return 'Esperto';
    return 'Principiante';
  }

  getStats(realStats: AppUserProfile['stats']) {
    const totalAnswers = realStats.correctAnswers + realStats.wrongAnswers;

    const correctPercentage =
      totalAnswers <= 0
        ? 0
        : Math.round((realStats.correctAnswers / totalAnswers) * 100);

    return [
      {
        icon: '🏆',
        value: String(realStats.quizPlayed),
        label: 'Quiz giocati',
      },
      {
        icon: '🎯',
        value: `${correctPercentage}%`,
        label: '% corrette',
      },
      {
        icon: '🔥',
        value: String(realStats.streakDays),
        label: 'Giorni di streak',
      },
      {
        icon: '⭐',
        value: `${realStats.bestScore}/10`,
        label: 'Miglior punteggio',
      },
    ];
  }

  getCategoryIcon(categoryId: string): string {
    const icons: Record<string, string> = {
      sport: '⚽',
      cinema: '🎬',
      storia: '🏛️',
      geografia: '🌍',
      scienza: '🔬',
      musica: '🎵',
      tecnologia: '💡',
      altro: '⭐',
    };

    return icons[categoryId] || '❓';
  }

  getCategoryTitle(categoryId: string): string {
    const titles: Record<string, string> = {
      sport: 'Sport',
      cinema: 'Cinema',
      storia: 'Storia',
      geografia: 'Geografia',
      scienza: 'Scienze',
      musica: 'Musica',
      tecnologia: 'Tecnologia',
      altro: 'Altro',
    };

    return titles[categoryId] || 'Quiz';
  }

  getResultClass(result: QuizHistoryItem): string {
    const percentage =
      result.totalQuestions <= 0
        ? 0
        : (result.correctAnswers / result.totalQuestions) * 100;

    if (percentage >= 80) return 'good';
    if (percentage >= 50) return 'medium';
    return 'bad';
  }

  getAchievements(realStats: AppUserProfile['stats']) {
    const totalAnswers = realStats.correctAnswers + realStats.wrongAnswers;

    const correctPercentage =
      totalAnswers <= 0
        ? 0
        : Math.round((realStats.correctAnswers / totalAnswers) * 100);

    return [
      {
        icon: realStats.bestScore >= 10 ? '🏆' : '🔒',
        title: 'Perfetto!',
        description: 'Fai 10/10 in un quiz',
        completed: realStats.bestScore >= 10,
        progress: `${realStats.bestScore}/10`,
      },
      {
        icon: realStats.streakDays >= 3 ? '🎯' : '🔒',
        title: 'Costante',
        description: 'Gioca per 3 giorni di fila',
        completed: realStats.streakDays >= 3,
        progress: `${realStats.streakDays}/3`,
      },
      {
        icon: correctPercentage >= 70 ? '⚡' : '🔒',
        title: 'Preciso',
        description: 'Raggiungi il 70% di risposte corrette',
        completed: correctPercentage >= 70,
        progress: `${correctPercentage}/70%`,
      },
      {
        icon: realStats.quizPlayed >= 100 ? '👑' : '🔒',
        title: 'Esperto',
        description: 'Gioca 100 quiz',
        completed: realStats.quizPlayed >= 100,
        progress: `${realStats.quizPlayed}/100`,
      },
      {
        icon: realStats.quizPlayed >= 10 ? '🚀' : '🔒',
        title: 'Partenza',
        description: 'Gioca 10 quiz',
        completed: realStats.quizPlayed >= 10,
        progress: `${realStats.quizPlayed}/10`,
      },
      {
        icon: realStats.quizPlayed >= 50 ? '🔥' : '🔒',
        title: 'Allenato',
        description: 'Gioca 50 quiz',
        completed: realStats.quizPlayed >= 50,
        progress: `${realStats.quizPlayed}/50`,
      },
      {
        icon: realStats.quizPlayed >= 200 ? '💎' : '🔒',
        title: 'Veterano',
        description: 'Gioca 200 quiz',
        completed: realStats.quizPlayed >= 200,
        progress: `${realStats.quizPlayed}/200`,
      },
      {
        icon: realStats.streakDays >= 7 ? '📆' : '🔒',
        title: 'Settimana d’oro',
        description: 'Gioca per 7 giorni di fila',
        completed: realStats.streakDays >= 7,
        progress: `${realStats.streakDays}/7`,
      },
      {
        icon: realStats.streakDays >= 30 ? '🌟' : '🔒',
        title: 'Inarrestabile',
        description: 'Gioca per 30 giorni di fila',
        completed: realStats.streakDays >= 30,
        progress: `${realStats.streakDays}/30`,
      },
      {
        icon: correctPercentage >= 80 ? '🎯' : '🔒',
        title: 'Cecchino',
        description: 'Raggiungi l’80% di risposte corrette',
        completed: correctPercentage >= 80,
        progress: `${correctPercentage}/80%`,
      },
      {
        icon: correctPercentage >= 90 ? '🧠' : '🔒',
        title: 'Genio',
        description: 'Raggiungi il 90% di risposte corrette',
        completed: correctPercentage >= 90,
        progress: `${correctPercentage}/90%`,
      },
      {
        icon: realStats.level >= 10 ? '👑' : '🔒',
        title: 'Re del quiz',
        description: 'Raggiungi il livello 10',
        completed: realStats.level >= 10,
        progress: `${realStats.level}/10`,
      },
    ];
  }

  getPlayerName(user: User | null): string {
    if (!user || user.isAnonymous) return 'Giocatore';
    return user.displayName?.split(' ')[0] || 'Giocatore';
  }

  getAvatarLetter(user: User | null): string {
    return this.getPlayerName(user).charAt(0).toUpperCase();
  }

  getSelectedAvatarIcon(user: User | null): string {
    return this.getAvatarIcon(this.selectedAvatar, user);
  }

  getAvatarIcon(avatarId: string, user: User | null): string {
    const avatar = this.allAvatars.find((a) => a.id === avatarId);

    if (!avatar || avatar.id === 'letter') {
      return this.getAvatarLetter(user);
    }

    return avatar.icon || this.getAvatarLetter(user);
  }

  isAvatarUnlocked(minLevel: number, currentLevel: number): boolean {
    return currentLevel >= minLevel;
  }

  openAvatarModal() {
    this.tempSelectedAvatar = this.selectedAvatar;
    this.showAvatarModal = true;
  }

  closeAvatarModal() {
    this.showAvatarModal = false;
    this.tempSelectedAvatar = this.selectedAvatar;
  }

  chooseTempAvatar(avatarId: string, currentLevel: number) {
    const avatar = this.allAvatars.find((a) => a.id === avatarId);

    if (!avatar || !this.isAvatarUnlocked(avatar.minLevel, currentLevel)) {
      return;
    }

    this.tempSelectedAvatar = avatarId;
  }

  saveAvatar() {
    this.selectedAvatar = this.tempSelectedAvatar;
    localStorage.setItem('profile_avatar', this.selectedAvatar);
    this.showAvatarModal = false;
  }

  openAchievementsModal() {
    this.showAchievementsModal = true;
  }

  closeAchievementsModal() {
    this.showAchievementsModal = false;
  }

  private getJoinDate(): string {
    const key = 'profile_join_date';

    let stored = localStorage.getItem(key);

    if (!stored) {
      stored = new Date().toISOString();
      localStorage.setItem(key, stored);
    }

    return this.formatJoinDate(stored);
  }

  private formatJoinDate(dateString: string): string {
    const date = new Date(dateString);

    return `Giocatore da ${date.toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric',
    })}`;
  }
}
