import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { User } from 'firebase/auth';
import {
  firstValueFrom,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';
import { UserStatsService } from 'src/app/services/user-stats.service';
import { DailyRewardService } from 'src/app/services/daily-reward.service';
import { AuthService } from 'src/app/services/auth.service';
import { AchievementModel } from 'src/app/models/achievement.model';
import { ProfileStatModel } from 'src/app/models/profile-stat.model';
import { AVATARS } from 'src/app/data/avatars.data';
import {
  ACHIEVEMENTS,
  AchievementDefinition,
} from 'src/app/data/achievements.data';
import { AvatarModel } from 'src/app/models/avatar.model';
import {
  AppUserProfile,
  QuizHistoryItem,
} from 'src/app/models/user-stats.model';
import { getLevelProgress } from 'src/app/utils/level-progress.util';

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
      if (!user) return of(undefined);
      return this.userStatsService.getUserProfile(user.uid);
    }),
    shareReplay(1),
  );

  readonly profileStats$ = this.profile$.pipe(
    map((profile) => profile?.stats ?? this.userStatsService.defaultStats),
  );

  recentResults$: Observable<QuizHistoryItem[]> = this.user$.pipe(
    switchMap((user) => {
      if (!user) return of([]);
      return this.userStatsService.getRecentQuizHistory(user.uid, 5);
    }),
  );

  joinDate$ = this.profile$.pipe(
    map((profile) => this.getJoinDate(profile?.createdAt)),
  );

  selectedAvatar = this.dailyRewardService.getSelectedAvatar();
  tempSelectedAvatar = this.selectedAvatar;
  unlockedAvatarIds: string[] = [];
  tempNickname = '';
  nicknameMaxLength = 16;
  nicknameSaving = false;

  showAvatarModal = false;
  showAchievementsModal = false;

  readonly avatars: AvatarModel[] = [...AVATARS];

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
    private dailyRewardService: DailyRewardService,
  ) {}

  get baseAvatars(): AvatarModel[] {
    return this.avatars.filter((avatar) => avatar.source === 'base');
  }

  get dailyRewardAvatars(): AvatarModel[] {
    return this.avatars.filter((avatar) => avatar.source === 'daily');
  }

  get epicRewardAvatars(): AvatarModel[] {
    return this.avatars.filter((avatar) => avatar.source === 'epic');
  }

  get tutorialRewardAvatars(): AvatarModel[] {
    return this.avatars.filter((avatar) => avatar.source === 'tutorial');
  }

  getCurrentLevelXp(xp: number): number {
    return getLevelProgress(xp).currentLevelXp;
  }

  getNextLevelXp(xp: number): number {
    return getLevelProgress(xp).nextLevelXp;
  }

  getXpPercent(xp: number): number {
    return getLevelProgress(xp).progressPercent;
  }

  isMaxLevel(xp: number): boolean {
    return getLevelProgress(xp).isMaxLevel;
  }

  getTitle(level: number): string {
    if (level >= 10) return 'Leggenda del Quiz';
    if (level >= 7) return 'Quiz Master';
    if (level >= 4) return 'Esperto';
    return 'Principiante';
  }

  getStats(realStats: AppUserProfile['stats']): ProfileStatModel[] {
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
      { icon: '🎯', value: `${correctPercentage}%`, label: '% corrette' },
      {
        icon: '🔥',
        value: String(realStats.streakDays),
        label: 'Giorni di streak',
      },
      {
        icon: '🪙',
        value: String(realStats.coins),
        label: 'TurtleCoins',
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

  getAchievements(realStats: AppUserProfile['stats']): AchievementModel[] {
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

  getFeaturedAchievements(
    realStats: AppUserProfile['stats'],
    profile?: AppUserProfile | null,
  ): AchievementModel[] {
    return [...this.getAlignedAchievements(realStats, profile)]
      .sort(
        (first, second) =>
          Number(first.completed) - Number(second.completed) ||
          (second.progressValue ?? 0) - (first.progressValue ?? 0),
      )
      .slice(0, 4);
  }

  getAlignedAchievements(
    realStats: AppUserProfile['stats'],
    profile?: AppUserProfile | null,
  ): AchievementModel[] {
    const totalAnswers = realStats.correctAnswers + realStats.wrongAnswers;
    const correctPercentage =
      totalAnswers <= 0
        ? 0
        : Math.round((realStats.correctAnswers / totalAnswers) * 100);

    return ACHIEVEMENTS.map((achievement) =>
      this.buildAchievement(
        achievement,
        realStats,
        profile,
        totalAnswers,
        correctPercentage,
      ),
    );
  }

  private buildAchievement(
    achievement: AchievementDefinition,
    realStats: AppUserProfile['stats'],
    profile: AppUserProfile | null | undefined,
    totalAnswers: number,
    correctPercentage: number,
  ): AchievementModel {
    if (achievement.metric === 'accuracy') {
      return this.buildAccuracyAchievement(
        achievement,
        totalAnswers,
        correctPercentage,
      );
    }

    const value = this.getAchievementValue(achievement, realStats, profile);
    const completed = value >= achievement.target;

    return {
      id: achievement.id,
      icon: completed ? achievement.icon : '🔒',
      title: achievement.title,
      description: achievement.description,
      completed,
      progress: this.formatAchievementProgress(achievement, value),
      progressValue: this.getProgressValue(value, achievement.target),
      reward: achievement.reward,
    };
  }

  private buildAccuracyAchievement(
    achievement: AchievementDefinition,
    totalAnswers: number,
    correctPercentage: number,
  ): AchievementModel {
    const minAnswers = achievement.minAnswers ?? 0;
    const hasEnoughAnswers = totalAnswers >= minAnswers;
    const completed = hasEnoughAnswers && correctPercentage >= achievement.target;
    const progress = hasEnoughAnswers
      ? `${correctPercentage}/${achievement.target}%`
      : `${totalAnswers}/${minAnswers} risposte`;

    return {
      id: achievement.id,
      icon: completed ? achievement.icon : '🔒',
      title: achievement.title,
      description: achievement.description,
      completed,
      progress,
      progressValue: hasEnoughAnswers
        ? this.getProgressValue(correctPercentage, achievement.target)
        : this.getProgressValue(totalAnswers, minAnswers),
      reward: achievement.reward,
    };
  }

  private getAchievementValue(
    achievement: AchievementDefinition,
    realStats: AppUserProfile['stats'],
    profile?: AppUserProfile | null,
  ): number {
    switch (achievement.metric) {
      case 'quizPlayed':
        return realStats.quizPlayed;
      case 'correctAnswers':
        return realStats.correctAnswers;
      case 'level':
        return realStats.level;
      case 'xp':
        return realStats.xp;
      case 'streakDays':
        return realStats.streakDays;
      case 'avatarsUnlocked':
        return profile?.avatar?.unlockedAvatarIds?.length ?? 0;
      case 'tutorialCompleted':
        return profile?.onboarding?.tutorialCompleted ? 1 : 0;
      default:
        return 0;
    }
  }

  private formatAchievementProgress(
    achievement: AchievementDefinition,
    value: number,
  ): string {
    const cappedValue = Math.min(value, achievement.target);

    if (achievement.metric === 'xp') {
      return `${cappedValue}/${achievement.target} XP`;
    }

    if (achievement.metric === 'tutorialCompleted') {
      return cappedValue >= 1 ? 'Completato' : '0/1';
    }

    return `${cappedValue}/${achievement.target}`;
  }

  private getProgressValue(value: number, target: number): number {
    if (target <= 0) return 0;

    return Math.min(100, Math.round((value / target) * 100));
  }

  getPlayerName(user: User | null, profile?: AppUserProfile | null): string {
    if (profile?.nickname?.trim()) return profile.nickname.trim();

    const providerName = user?.displayName || profile?.displayName;

    if (providerName?.trim()) {
      return providerName.trim().split(/\s+/)[0] || 'Giocatore';
    }

    if (!user) return 'Giocatore';
    if (user.isAnonymous) return 'Ospite';

    return 'Giocatore';
  }

  getAvatarLetter(user: User | null, profile?: AppUserProfile | null): string {
    return this.getPlayerName(user, profile).charAt(0).toUpperCase();
  }

  getSelectedAvatarIcon(
    user: User | null,
    profile?: AppUserProfile | null,
  ): string {
    return this.getAvatarIcon(this.selectedAvatar, user, profile);
  }

  getSelectedAvatarImageSrc(): string | null {
    return this.getAvatarImageSrc(this.selectedAvatar);
  }

  getAvatarIcon(
    avatarId: string,
    user: User | null,
    profile?: AppUserProfile | null,
  ): string {
    const avatar = this.avatars.find((item) => item.id === avatarId);

    if (!avatar || avatar.id === 'letter') {
      return this.getAvatarLetter(user, profile);
    }

    return avatar.icon || this.getAvatarLetter(user, profile);
  }

  getAvatarImageSrc(avatarId: string): string | null {
    const avatar = this.avatars.find((item) => item.id === avatarId);
    const icon = avatar?.icon ?? '';

    return icon.startsWith('assets/') ? icon : null;
  }

  isRewardAvatarUnlocked(avatarId: string): boolean {
    return this.unlockedAvatarIds.includes(avatarId);
  }

  isAvatarUnlocked(
    minLevel: number | undefined,
    currentLevel: number,
  ): boolean {
    return currentLevel >= (minLevel ?? 1);
  }

  async openAvatarModal() {
    const user = await firstValueFrom(this.user$);
    const profile = await firstValueFrom(this.profile$);

    this.selectedAvatar = profile?.avatar?.selectedAvatar ?? 'letter';
    this.tempSelectedAvatar = this.selectedAvatar;
    this.unlockedAvatarIds = profile?.avatar?.unlockedAvatarIds ?? [];
    this.tempNickname = this.getPlayerName(user, profile);

    this.showAvatarModal = true;
  }

  closeAvatarModal() {
    this.showAvatarModal = false;
    this.tempSelectedAvatar = this.selectedAvatar;
    this.nicknameSaving = false;
  }

  updateTempNickname(value: string) {
    this.tempNickname = value.slice(0, this.nicknameMaxLength);
  }

  chooseTempAvatar(avatarId: string, currentLevel: number) {
    const avatar = this.avatars.find((item) => item.id === avatarId);

    if (!avatar) return;

    if (avatar.source === 'base') {
      if (!this.isAvatarUnlocked(avatar.minLevel, currentLevel)) return;

      this.tempSelectedAvatar = avatarId;
      return;
    }

    if (!this.isRewardAvatarUnlocked(avatarId)) return;

    this.tempSelectedAvatar = avatarId;
  }

  async saveAvatar() {
    const user = await firstValueFrom(this.user$);
    const profile = await firstValueFrom(this.profile$);

    if (!user) return;

    this.nicknameSaving = true;
    this.selectedAvatar = this.tempSelectedAvatar;
    const nickname =
      this.normalizeNickname(this.tempNickname) ||
      this.getPlayerName(user, profile);

    try {
      await Promise.all([
        this.dailyRewardService.saveSelectedAvatar(this.selectedAvatar),
        this.userStatsService.saveNickname(user.uid, nickname),
      ]);

      this.showAvatarModal = false;
    } finally {
      this.nicknameSaving = false;
    }
  }

  openAchievementsModal() {
    this.showAchievementsModal = true;
  }

  closeAchievementsModal() {
    this.showAchievementsModal = false;
  }

  private getJoinDate(createdAt: unknown): string {
    const date = this.toDate(createdAt);

    if (!date) return 'Giocatore da oggi';

    return this.formatJoinDate(date);
  }

  private formatJoinDate(date: Date): string {
    return `Giocatore da ${date.toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric',
    })}`;
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;

    if (value instanceof Date) return value;

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (
      typeof value === 'object' &&
      'toDate' in value &&
      typeof value.toDate === 'function'
    ) {
      return value.toDate();
    }

    return null;
  }

  private normalizeNickname(value: string): string {
    return value.trim().replace(/\s+/g, ' ').slice(0, this.nicknameMaxLength);
  }
}
