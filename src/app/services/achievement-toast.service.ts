import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription, map, of, switchMap } from 'rxjs';
import {
  ACHIEVEMENTS,
  AchievementDefinition,
} from 'src/app/data/achievements.data';
import { STORAGE_KEYS } from 'src/app/config/storage-keys.config';
import { AppUserProfile } from 'src/app/models/user-stats.model';
import { AuthService } from './auth.service';
import { UserStatsService } from './user-stats.service';

export interface AchievementToast {
  id: string;
  icon: string;
  title: string;
  description: string;
  visible: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AchievementToastService implements OnDestroy {
  private readonly toastDurationMs = 4800;
  private readonly toastExitMs = 360;
  private readonly toastGapMs = 260;

  private subscription?: Subscription;
  private activeTimer?: ReturnType<typeof setTimeout>;
  private queue: AchievementToast[] = [];
  private currentUid: string | null = null;
  private initializedForUser = false;
  private currentToastSubject = new BehaviorSubject<AchievementToast | null>(
    null,
  );

  readonly currentToast$ = this.currentToastSubject.asObservable();

  constructor(
    private auth: AuthService,
    private userStatsService: UserStatsService,
  ) {}

  start(): void {
    if (this.subscription) return;

    this.subscription = this.auth.user$
      .pipe(
        switchMap((user) => {
          if (!user) return of(null);

          return this.userStatsService.getUserProfile(user.uid).pipe(
            map((profile) => ({
              uid: user.uid,
              profile,
            })),
          );
        }),
      )
      .subscribe((snapshot) => {
        if (!snapshot?.profile) {
          this.resetRuntimeState();
          return;
        }

        this.handleProfileUpdate(snapshot.uid, snapshot.profile);
      });
  }

  ngOnDestroy(): void {
    this.stop();
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.clearTimer();
  }

  private handleProfileUpdate(uid: string, profile: AppUserProfile): void {
    if (uid !== this.currentUid) {
      this.currentUid = uid;
      this.initializedForUser = false;
      this.queue = [];
      this.currentToastSubject.next(null);
      this.clearTimer();
    }

    const completedAchievements = this.getCompletedAchievements(profile);
    const notifiedIds = this.getNotifiedIds(uid);

    /*
     * Primo snapshot: salviamo lo stato attuale senza mostrare banner
     * retroattivi. Da qui in poi notifichiamo solo i nuovi trofei.
     */
    if (!this.initializedForUser) {
      this.initializedForUser = true;
      this.saveNotifiedIds(
        uid,
        new Set([
          ...notifiedIds,
          ...completedAchievements.map((item) => item.id),
        ]),
      );
      return;
    }

    const newAchievements = completedAchievements.filter(
      (achievement) => !notifiedIds.has(achievement.id),
    );

    if (newAchievements.length === 0) return;

    const updatedIds = new Set(notifiedIds);

    for (const achievement of newAchievements) {
      updatedIds.add(achievement.id);
      this.enqueueToast({
        id: achievement.id,
        icon: achievement.icon,
        title: achievement.title,
        description: achievement.description,
        visible: true,
      });
    }

    this.saveNotifiedIds(uid, updatedIds);
  }

  private enqueueToast(toast: AchievementToast): void {
    this.queue.push(toast);

    if (!this.currentToastSubject.value) {
      this.showNextToast();
    }
  }

  private showNextToast(): void {
    const nextToast = this.queue.shift() ?? null;

    this.currentToastSubject.next(nextToast);
    this.clearTimer();

    if (!nextToast) return;

    this.activeTimer = setTimeout(() => {
      this.currentToastSubject.next({
        ...nextToast,
        visible: false,
      });
      this.activeTimer = setTimeout(() => {
        this.currentToastSubject.next(null);
        this.showNextToast();
      }, this.toastExitMs + this.toastGapMs);
    }, this.toastDurationMs);
  }

  private getCompletedAchievements(
    profile: AppUserProfile,
  ): AchievementDefinition[] {
    const stats = profile.stats ?? this.userStatsService.defaultStats;
    const totalAnswers = stats.correctAnswers + stats.wrongAnswers;
    const correctPercentage =
      totalAnswers <= 0
        ? 0
        : Math.round((stats.correctAnswers / totalAnswers) * 100);

    return ACHIEVEMENTS.filter((achievement) => {
      if (achievement.metric === 'accuracy') {
        return (
          totalAnswers >= (achievement.minAnswers ?? 0) &&
          correctPercentage >= achievement.target
        );
      }

      return (
        this.getAchievementValue(achievement, profile) >= achievement.target
      );
    });
  }

  private getAchievementValue(
    achievement: AchievementDefinition,
    profile: AppUserProfile,
  ): number {
    const stats = profile.stats ?? this.userStatsService.defaultStats;

    switch (achievement.metric) {
      case 'quizPlayed':
        return stats.quizPlayed;
      case 'correctAnswers':
        return stats.correctAnswers;
      case 'level':
        return stats.level;
      case 'xp':
        return stats.xp;
      case 'streakDays':
        return stats.streakDays;
      case 'avatarsUnlocked':
        return profile.avatar?.unlockedAvatarIds?.length ?? 0;
      case 'tutorialCompleted':
        return profile.onboarding?.tutorialCompleted ? 1 : 0;
      default:
        return 0;
    }
  }

  private getNotifiedIds(uid: string): Set<string> {
    const rawValue = localStorage.getItem(this.getStorageKey(uid));

    if (!rawValue) return new Set();

    try {
      const parsedValue = JSON.parse(rawValue) as unknown;

      return new Set(
        Array.isArray(parsedValue)
          ? parsedValue.filter(
              (item): item is string => typeof item === 'string',
            )
          : [],
      );
    } catch {
      return new Set();
    }
  }

  private saveNotifiedIds(uid: string, notifiedIds: Set<string>): void {
    localStorage.setItem(
      this.getStorageKey(uid),
      JSON.stringify(Array.from(notifiedIds)),
    );
  }

  private getStorageKey(uid: string): string {
    return `${STORAGE_KEYS.notifiedAchievements}_${uid}`;
  }

  private resetRuntimeState(): void {
    this.currentUid = null;
    this.initializedForUser = false;
    this.queue = [];
    this.currentToastSubject.next(null);
    this.clearTimer();
  }

  private clearTimer(): void {
    if (!this.activeTimer) return;

    clearTimeout(this.activeTimer);
    this.activeTimer = undefined;
  }
}
