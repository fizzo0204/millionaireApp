import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { User } from 'firebase/auth';
import { map, Observable, of, switchMap } from 'rxjs';
import {
  UserStatsService,
  AppUserProfile,
} from 'src/app/services/user-stats.service';

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

  joinDate = this.getJoinDate();

  quizPlayed = 125;
  correctPercentage = 68;
  streakDays = 7;
  bestScore = 9;

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

  recentResults = [
    {
      icon: '🧠',
      category: 'Scienze',
      meta: '15 Mag 2025 • 10 domande',
      score: '8/10',
      className: 'good',
    },
    {
      icon: '⚽',
      category: 'Sport',
      meta: '15 Mag 2025 • 10 domande',
      score: '7/10',
      className: 'medium',
    },
    {
      icon: '🎬',
      category: 'Cinema',
      meta: '14 Mag 2025 • 10 domande',
      score: '9/10',
      className: 'good',
    },
  ];

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
  ) {}

  get level(): number {
    return Math.max(1, Math.floor(this.quizPlayed / 20) + 1);
  }

  get currentXp(): number {
    return (this.quizPlayed % 20) * 50;
  }

  getXpPercent(xp: number): number {
    return Math.min(100, Math.round((xp / this.maxXp) * 100));
  }

  get maxXp(): number {
    return 1000;
  }

  get title(): string {
    if (this.level >= 10) return 'Leggenda del Quiz';
    if (this.level >= 7) return 'Quiz Master';
    if (this.level >= 4) return 'Esperto';
    return 'Principiante';
  }

  get xpPercent(): number {
    return Math.min(100, Math.round((this.currentXp / this.maxXp) * 100));
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

  get achievements() {
    return [
      {
        icon: this.bestScore >= 10 ? '🏆' : '🔒',
        title: 'Perfetto!',
        description: 'Fai 10/10 in un quiz',
        completed: this.bestScore >= 10,
        progress: `${this.bestScore}/10`,
      },
      {
        icon: this.streakDays >= 3 ? '🎯' : '🔒',
        title: 'Costante',
        description: 'Gioca per 3 giorni di fila',
        completed: this.streakDays >= 3,
        progress: `${this.streakDays}/3`,
      },
      {
        icon: this.correctPercentage >= 70 ? '⚡' : '🔒',
        title: 'Preciso',
        description: 'Raggiungi il 70% di risposte corrette',
        completed: this.correctPercentage >= 70,
        progress: `${this.correctPercentage}/70%`,
      },
      {
        icon: this.quizPlayed >= 100 ? '👑' : '🔒',
        title: 'Esperto',
        description: 'Gioca 100 quiz',
        completed: this.quizPlayed >= 100,
        progress: `${this.quizPlayed}/100`,
      },
      {
        icon: this.quizPlayed >= 10 ? '🚀' : '🔒',
        title: 'Partenza',
        description: 'Gioca 10 quiz',
        completed: this.quizPlayed >= 10,
        progress: `${this.quizPlayed}/10`,
      },
      {
        icon: this.quizPlayed >= 50 ? '🔥' : '🔒',
        title: 'Allenato',
        description: 'Gioca 50 quiz',
        completed: this.quizPlayed >= 50,
        progress: `${this.quizPlayed}/50`,
      },
      {
        icon: this.quizPlayed >= 200 ? '💎' : '🔒',
        title: 'Veterano',
        description: 'Gioca 200 quiz',
        completed: this.quizPlayed >= 200,
        progress: `${this.quizPlayed}/200`,
      },
      {
        icon: this.streakDays >= 7 ? '📆' : '🔒',
        title: 'Settimana d’oro',
        description: 'Gioca per 7 giorni di fila',
        completed: this.streakDays >= 7,
        progress: `${this.streakDays}/7`,
      },
      {
        icon: this.streakDays >= 30 ? '🌟' : '🔒',
        title: 'Inarrestabile',
        description: 'Gioca per 30 giorni di fila',
        completed: this.streakDays >= 30,
        progress: `${this.streakDays}/30`,
      },
      {
        icon: this.correctPercentage >= 80 ? '🎯' : '🔒',
        title: 'Cecchino',
        description: 'Raggiungi l’80% di risposte corrette',
        completed: this.correctPercentage >= 80,
        progress: `${this.correctPercentage}/80%`,
      },
      {
        icon: this.correctPercentage >= 90 ? '🧠' : '🔒',
        title: 'Genio',
        description: 'Raggiungi il 90% di risposte corrette',
        completed: this.correctPercentage >= 90,
        progress: `${this.correctPercentage}/90%`,
      },
      {
        icon: this.level >= 10 ? '👑' : '🔒',
        title: 'Re del quiz',
        description: 'Raggiungi il livello 10',
        completed: this.level >= 10,
        progress: `${this.level}/10`,
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
    const avatar = this.avatars.find((a) => a.id === avatarId);

    if (!avatar || avatar.id === 'letter') {
      return this.getAvatarLetter(user);
    }

    return avatar.icon || this.getAvatarLetter(user);
  }

  isAvatarUnlocked(minLevel: number): boolean {
    return this.level >= minLevel;
  }

  openAvatarModal() {
    this.tempSelectedAvatar = this.selectedAvatar;
    this.showAvatarModal = true;
  }

  closeAvatarModal() {
    this.showAvatarModal = false;
    this.tempSelectedAvatar = this.selectedAvatar;
  }

  chooseTempAvatar(avatarId: string) {
    const avatar = this.avatars.find((a) => a.id === avatarId);

    if (!avatar || !this.isAvatarUnlocked(avatar.minLevel)) return;

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

  get achievementsPreview() {
    return this.achievements.slice(0, 4);
  }
}
