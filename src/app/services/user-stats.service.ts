import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { User } from 'firebase/auth';
import { Observable } from 'rxjs';
import {
  Firestore,
  doc,
  getDoc,
  runTransaction,
  updateDoc,
} from '@angular/fire/firestore';

import {
  AppUserProfile,
  QuizHistoryItem,
  UserAchievementsData,
  UserAchievementTitle,
  UserArcadeData,
  UserAvatarData,
  UserOnboardingData,
  UserProfileMigrationSnapshot,
  UserStats,
} from 'src/app/models/user-stats.model';
import { DifficultyId } from 'src/app/models/difficulty.model';
import {
  DailyRewardClaimPayload,
  UserDailyRewardData,
} from 'src/app/models/daily-reward.model';
import { ProviderProfileMetadata } from 'src/app/models/auth.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

import { UserProfileDataService } from 'src/app/services/user-profile-data.service';
import { UserArcadeDataService } from 'src/app/services/user-arcade-data.service';
import { UserDailyRewardDataService } from 'src/app/services/user-daily-reward-data.service';
import { UserAvatarDataService } from 'src/app/services/user-avatar-data.service';
import { UserQuizDataService } from 'src/app/services/user-quiz-data.service';
import { UserDebugDataService } from 'src/app/services/user-debug-data.service';

@Injectable({
  providedIn: 'root',
})
export class UserStatsService {
  private profileData = inject(UserProfileDataService);
  private arcadeData = inject(UserArcadeDataService);
  private dailyRewardData = inject(UserDailyRewardDataService);
  private avatarData = inject(UserAvatarDataService);
  private quizData = inject(UserQuizDataService);
  private debugData = inject(UserDebugDataService);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  readonly progressSubcollectionNames = [
    'completedLevels',
    'quizHistory',
    'progress',
  ] as const;

  readonly defaultStats: UserStats = {
    quizPlayed: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    bestScore: 0,
    streakDays: 0,
    xp: 0,
    level: USER_STATS_CONFIG.defaultLevel,
    levelRewardLastClaimedLevel: USER_STATS_CONFIG.defaultLevel,
    coins: USER_STATS_CONFIG.defaultCoins,
    lives: USER_STATS_CONFIG.defaultLives,
    lastQuizPlayedAt: null,
  };

  readonly defaultAvatar: UserAvatarData = {
    selectedAvatar: 'letter',
    unlockedAvatarIds: [],
  };

  readonly defaultDailyReward: UserDailyRewardData = {
    currentDay: 1,
    lastClaimDate: null,
    lastClaimedAt: null,
    claimedToday: false,
  };

  readonly defaultOnboarding: UserOnboardingData = {
    tutorialCompleted: false,
    tutorialRewardClaimed: false,
    tutorialSkipped: false,
  };

  readonly defaultArcade: UserArcadeData = {
    currentLevel: 1,
    bestLevel: 1,
    totalLevelsCompleted: 0,
    lastPlayedAt: null,
    lastCompletedAt: null,
  };

  readonly defaultAchievements: UserAchievementsData = {
    claimedRewards: [],
    unlockedTitles: [],
    selectedTitle: null,
    unlockedFrames: [],
    unlockedBadges: [],
  };

  // Crea o aggiorna il documento principale dell'utente su Firestore.
  async ensureUserProfile(user: User): Promise<void> {
    return this.profileData.ensureUserProfile(user);
  }

  // Registra che il profilo corrente e stato collegato a un provider.
  async mergeCurrentProgressIntoLinkedAccount(uid: string): Promise<void> {
    return this.profileData.mergeCurrentProgressIntoLinkedAccount(uid);
  }

  // Marca un profilo come proveniente da Play Games.
  async markPlayGamesProfile(
    uid: string,
    profile?: ProviderProfileMetadata,
  ): Promise<void> {
    return this.profileData.markPlayGamesProfile(uid, profile);
  }

  // Controlla se un profilo ha progressi reali da preservare.
  hasMeaningfulSavedProgress(
    profileData: Record<string, unknown> | null | undefined,
    hasSubcollectionData = false,
  ): boolean {
    return this.profileData.hasMeaningfulSavedProgress(
      profileData,
      hasSubcollectionData,
    );
  }

  // Crea uno snapshot del profilo prima di una migrazione tra UID.
  async createProfileMigrationSnapshot(
    uid: string,
  ): Promise<UserProfileMigrationSnapshot> {
    return this.profileData.createProfileMigrationSnapshot(uid);
  }

  // Ripristina uno snapshot su un account collegato.
  async restoreProfileSnapshotIntoLinkedAccount(
    user: User,
    snapshot: UserProfileMigrationSnapshot,
  ): Promise<void> {
    return this.profileData.restoreProfileSnapshotIntoLinkedAccount(
      user,
      snapshot,
    );
  }

  // Aggiorna i marker Firestore usati durante la migrazione profilo.
  async ensureProfileMigrationMarkers(uid: string): Promise<void> {
    return this.profileData.ensureProfileMigrationMarkers(uid);
  }

  // Restituisce il profilo utente osservabile.
  getUserProfile(uid: string): Observable<AppUserProfile | undefined> {
    return this.profileData.getUserProfile(uid);
  }

  // Controlla se il documento profilo esiste su Firestore.
  async userProfileExists(uid: string): Promise<boolean> {
    return this.profileData.userProfileExists(uid);
  }

  // Salva il nickname scelto dall'utente.
  async saveNickname(uid: string, nickname: string): Promise<void> {
    return this.profileData.saveNickname(uid, nickname);
  }

  // Recupera i dati della modalità Scalata.
  async getArcadeData(uid: string): Promise<UserArcadeData> {
    return this.arcadeData.getArcadeData(uid);
  }

  // Registra il completamento di un livello Scalata.
  async recordArcadeLevelCompleted(
    uid: string,
    completedArcadeLevel: number,
    rewardCoins: number,
    rewardXp: number,
  ): Promise<UserArcadeData | null> {
    return this.arcadeData.recordArcadeLevelCompleted(
      uid,
      completedArcadeLevel,
      rewardCoins,
      rewardXp,
    );
  }

  // Registra un errore nella modalità Scalata.
  async recordArcadeMistake(uid: string): Promise<void> {
    return this.arcadeData.recordArcadeMistake(uid);
  }

  // Recupera lo stato del daily reward.
  async getDailyRewardData(uid: string): Promise<UserDailyRewardData> {
    return this.dailyRewardData.getDailyRewardData(uid);
  }

  // Aggiorna lo stato del daily reward.
  async updateDailyRewardData(
    uid: string,
    data: Partial<UserDailyRewardData>,
  ): Promise<void> {
    return this.dailyRewardData.updateDailyRewardData(uid, data);
  }

  // Riscatta il premio giornaliero in transaction.
  async claimDailyReward(
    uid: string,
    todayKey: string,
    expectedRewardDay: number,
    maxRewardDay: number,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<UserDailyRewardData | null> {
    return this.dailyRewardData.claimDailyReward(
      uid,
      todayKey,
      expectedRewardDay,
      maxRewardDay,
      rewardPayload,
    );
  }

  // Applica un bonus extra del daily reward.
  async applyDailyRewardBonus(
    uid: string,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<boolean> {
    return this.dailyRewardData.applyDailyRewardBonus(uid, rewardPayload);
  }

  // Recupera avatar selezionato e avatar sbloccati.
  async getAvatarData(uid: string): Promise<UserAvatarData> {
    return this.avatarData.getAvatarData(uid);
  }

  // Sblocca un avatar giornaliero se non era gia presente.
  async unlockDailyAvatar(uid: string, avatarId: string): Promise<void> {
    return this.avatarData.unlockDailyAvatar(uid, avatarId);
  }

  // Salva l'avatar selezionato.
  async saveSelectedAvatar(uid: string, avatarId: string): Promise<void> {
    return this.avatarData.saveSelectedAvatar(uid, avatarId);
  }

  // Aggiorna i dati avatar.
  async updateAvatarData(
    uid: string,
    data: Partial<UserAvatarData>,
  ): Promise<void> {
    return this.avatarData.updateAvatarData(uid, data);
  }

  // Registra il risultato aggregato di un quiz.
  async recordQuizResult(
    uid: string,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    return this.quizData.recordQuizResult(uid, correctAnswers, totalQuestions);
  }

  // Aggiunge una riga nello storico quiz dell'utente.
  async recordQuizHistory(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    return this.quizData.recordQuizHistory(
      uid,
      categoryId,
      difficultyId,
      correctAnswers,
      totalQuestions,
    );
  }

  // Recupera gli ultimi quiz giocati.
  getRecentQuizHistory(
    uid: string,
    maxResults: number = 5,
  ): Observable<QuizHistoryItem[]> {
    return this.quizData.getRecentQuizHistory(uid, maxResults);
  }

  // Aggiunge XP al profilo e ricalcola il livello.
  async addXp(uid: string, amount: number): Promise<void> {
    return this.quizData.addXp(uid, amount);
  }

  // Riscatta le TurtleCoins per il level up.
  async claimLevelUpCoinsReward(
    uid: string,
    previousLevel: number,
    currentLevel: number,
    requestedCoinsReward: number,
  ): Promise<number> {
    return this.quizData.claimLevelUpCoinsReward(
      uid,
      previousLevel,
      currentLevel,
      requestedCoinsReward,
    );
  }

  // Recupera i dati cosmetici legati ai trofei dal documento utente.
  async getAchievementsData(uid: string): Promise<UserAchievementsData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await this.runFirestore(() => getDoc(userRef));

    if (!snapshot.exists()) {
      return this.defaultAchievements;
    }

    return this.normalizeAchievementsData(snapshot.data()['achievements']);
  }

  // Riscatta la ricompensa di un trofeo completato.
  // Al momento la ricompensa supportata e il titolo profilo, salvato su Firestore.
  async claimAchievementTitleReward(
    uid: string,
    achievementId: string,
    title: UserAchievementTitle,
  ): Promise<UserAchievementsData | null> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return null;

        const currentData = snapshot.data();
        const achievements = this.normalizeAchievementsData(
          currentData['achievements'],
        );

        if (achievements.claimedRewards.includes(achievementId)) {
          return achievements;
        }

        const unlockedTitles = achievements.unlockedTitles.some(
          (item) => item.id === title.id,
        )
          ? achievements.unlockedTitles
          : [...achievements.unlockedTitles, title];

        const nextAchievements: UserAchievementsData = {
          ...achievements,
          claimedRewards: [...achievements.claimedRewards, achievementId],
          unlockedTitles,
          selectedTitle: achievements.selectedTitle ?? title.id,
        };

        transaction.update(userRef, {
          achievements: nextAchievements,
        });

        return nextAchievements;
      }),
    );
  }

  // Aggiorna il titolo mostrato nel profilo.
  async selectProfileTitle(uid: string, titleId: string | null): Promise<void> {
    const achievements = await this.getAchievementsData(uid);

    if (
      titleId &&
      !achievements.unlockedTitles.some((title) => title.id === titleId)
    ) {
      return;
    }

    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      updateDoc(userRef, {
        'achievements.selectedTitle': titleId,
      }),
    );
  }

  private normalizeAchievementsData(data: unknown): UserAchievementsData {
    const raw = data as Partial<UserAchievementsData> | null | undefined;

    return {
      claimedRewards: Array.isArray(raw?.claimedRewards)
        ? raw.claimedRewards.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
      unlockedTitles: Array.isArray(raw?.unlockedTitles)
        ? raw.unlockedTitles.filter(
            (title): title is UserAchievementTitle =>
              !!title &&
              typeof title.id === 'string' &&
              typeof title.icon === 'string' &&
              typeof title.label === 'string' &&
              typeof title.rarity === 'string' &&
              typeof title.achievementId === 'string',
          )
        : [],
      selectedTitle:
        typeof raw?.selectedTitle === 'string' ? raw.selectedTitle : null,
      unlockedFrames: Array.isArray(raw?.unlockedFrames)
        ? raw.unlockedFrames.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
      unlockedBadges: Array.isArray(raw?.unlockedBadges)
        ? raw.unlockedBadges.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
    };
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }

  // Elimina completamente i dati profilo e le sottocollezioni principali.
  async deleteUserProfileData(uid: string): Promise<void> {
    return this.debugData.deleteUserProfileData(uid);
  }

  // Reset completo usato dai pulsanti debug.
  async resetUserDebugData(uid: string): Promise<void> {
    return this.debugData.resetUserDebugData(uid);
  }

  // Reset mirato della sola modalità Scalata.
  async resetArcadeDebugData(uid: string): Promise<void> {
    return this.debugData.resetArcadeDebugData(uid);
  }
}
