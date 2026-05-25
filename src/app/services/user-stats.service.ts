import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  runTransaction,
  docData,
  collection,
  addDoc,
  collectionData,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  UpdateData,
  DocumentData,
} from '@angular/fire/firestore';
import {
  UserStats,
  AppUserProfile,
  QuizHistoryItem,
  UserAvatarData,
  UserProfileMigrationSnapshot,
} from 'src/app/models/user-stats.model';
import { User } from 'firebase/auth';
import { Observable, map } from 'rxjs';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { getLevelFromXp } from 'src/app/utils/level-progress.util';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import {
  AppAuthProviderId,
  ProviderProfileMetadata,
  UserAuthProfile,
} from 'src/app/models/auth.model';
import { DifficultyId } from '../models/difficulty.model';
import {
  DailyRewardClaimPayload,
  UserDailyRewardData,
} from 'src/app/models/daily-reward.model';

@Injectable({
  providedIn: 'root',
})
export class UserStatsService {
  private firestore = inject(Firestore);

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
    claimedToday: false,
  };

  private getProviderIds(user: User): AppAuthProviderId[] {
    const providerIds = user.providerData
      .map((provider) => provider.providerId as AppAuthProviderId)
      .filter(Boolean);

    if (providerIds.length === 0) {
      return [
        user.isAnonymous
          ? AUTH_CONFIG.providers.anonymous
          : AUTH_CONFIG.providers.google,
      ];
    }

    return Array.from(new Set(providerIds));
  }

  private getDefaultAuthProfile(user: User): UserAuthProfile {
    const providerIds = this.getProviderIds(user);

    return {
      providerIds,
      createdFromProviderId: providerIds[0] ?? AUTH_CONFIG.providers.anonymous,
      loginRewardClaimed: false,
    };
  }

  async ensureUserProfile(user: User): Promise<void> {
    /*
     * Crea o aggiorna il documento principale dell'utente.
     * Vale anche per Firebase Anonymous Auth: quel profilo e il nostro
     * "ospite giocabile" e potra essere collegato piu avanti a Google/Facebook.
     */
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const snapshot = await getDoc(userRef);
    const authProfile = this.getDefaultAuthProfile(user);

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        stats: this.defaultStats,
        dailyReward: this.defaultDailyReward,
        avatar: this.defaultAvatar,
        auth: authProfile,
      });

      return;
    }

    const data = snapshot.data();

    const updates: UpdateData<DocumentData> = {
      lastLoginAt: serverTimestamp(),
    };

    /*
     * Non cancelliamo valori gia salvati con null. Play Games, durante il link
     * manuale, puo lasciare Firebase JS ancora "anonimo" per qualche istante:
     * in quel caso il nickname arriva dal plugin nativo e viene salvato a parte.
     */
    if (user.displayName) {
      updates['displayName'] = user.displayName;
    }

    if (user.email) {
      updates['email'] = user.email;
    }

    if (user.photoURL) {
      updates['photoURL'] = user.photoURL;
    }

    if (!data['dailyReward']) {
      updates['dailyReward'] = this.defaultDailyReward;
    }

    if (!data['stats']) {
      updates['stats'] = this.defaultStats;
    }

    if (!data['avatar']) {
      updates['avatar'] = {
        selectedAvatar:
          data['selectedAvatar'] ??
          data['dailyReward']?.selectedAvatar ??
          'letter',
        unlockedAvatarIds:
          data['unlockedAvatarIds'] ??
          data['dailyReward']?.unlockedAvatarIds ??
          [],
      };
    }

    updates['auth.providerIds'] = authProfile.providerIds;

    if (!data['auth']?.createdFromProviderId) {
      updates['auth.createdFromProviderId'] = authProfile.createdFromProviderId;
    }

    if (typeof data['auth']?.loginRewardClaimed !== 'boolean') {
      updates['auth.loginRewardClaimed'] = false;
    }

    await updateDoc(userRef, updates);
  }

  async mergeCurrentProgressIntoLinkedAccount(uid: string): Promise<void> {
    /*
     * Merge progressi per provider nuovi:
     * con linkWithCredential Firebase mantiene lo stesso UID del profilo corrente.
     * Quindi stats, coins, dailyReward, avatar e sottocollezioni sono gia
     * nello stesso profilo; qui registriamo solo che il passaggio e avvenuto.
     * Se il provider esiste gia, AuthService non chiama questo metodo e carica
     * il vecchio profilo solo dopo conferma dell'utente.
     */
    await this.ensureProfileMigrationMarkers(uid);
  }

  async markPlayGamesProfile(
    uid: string,
    profile?: ProviderProfileMetadata,
  ): Promise<void> {
    /*
     * Play Games entra da Android e poi viene scambiato con Firebase JS.
     * Questo marker rende esplicito in Firestore che il profilo base non e
     * anonimo ma Play Games, anche se providerData arrivasse incompleto.
     */
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    const auth = (data['auth'] ?? {}) as Partial<UserAuthProfile>;
    const providerIds = Array.from(
      new Set([
        ...(auth.providerIds ?? []).filter(
          (providerId) => providerId !== AUTH_CONFIG.providers.anonymous,
        ),
        AUTH_CONFIG.providers.playGames,
      ]),
    );

    const profileUpdates: Record<string, string> = {};

    if (profile?.displayName) {
      profileUpdates['displayName'] = profile.displayName;
    }

    if (profile?.photoURL) {
      profileUpdates['photoURL'] = profile.photoURL;
    }

    await setDoc(
      userRef,
      {
        ...profileUpdates,
        auth: {
          providerIds,
          createdFromProviderId:
            auth.createdFromProviderId === AUTH_CONFIG.providers.anonymous ||
            !auth.createdFromProviderId
              ? AUTH_CONFIG.providers.playGames
              : auth.createdFromProviderId,
          loginRewardClaimed: auth.loginRewardClaimed ?? false,
          lastMergeCheckedAt: serverTimestamp(),
        },
      },
      { merge: true },
    );
  }

  hasMeaningfulSavedProgress(
    profileData: Record<string, unknown> | null | undefined,
    hasSubcollectionData = false,
  ): boolean {
    /*
     * Un account Firebase Auth puo esistere anche senza una vera partita
     * salvata. Usiamo questo controllo per mostrare la modale di conflitto
     * solo quando troviamo progressi reali, non un profilo vuoto/default.
     */
    if (!profileData) return false;
    if (hasSubcollectionData) return true;

    const stats = profileData['stats'] as Partial<UserStats> | undefined;
    const dailyReward = profileData['dailyReward'] as
      | Partial<UserDailyRewardData>
      | undefined;
    const avatar = profileData['avatar'] as Partial<UserAvatarData> | undefined;
    const auth = profileData['auth'] as Partial<UserAuthProfile> | undefined;

    const hasStatsProgress = Boolean(
      (stats?.quizPlayed ?? 0) > 0 ||
      (stats?.correctAnswers ?? 0) > 0 ||
      (stats?.wrongAnswers ?? 0) > 0 ||
      (stats?.bestScore ?? 0) > 0 ||
      (stats?.streakDays ?? 0) > 0 ||
      Boolean(stats?.lastQuizPlayedAt) ||
      Boolean(stats?.lastLifeUpdate) ||
      (stats?.xp ?? this.defaultStats.xp) !== this.defaultStats.xp ||
      (stats?.level ?? this.defaultStats.level) !== this.defaultStats.level ||
      (stats?.coins ?? this.defaultStats.coins) !== this.defaultStats.coins ||
      (stats?.lives ?? this.defaultStats.lives) !== this.defaultStats.lives ||
      (stats?.levelRewardLastClaimedLevel ??
        this.defaultStats.levelRewardLastClaimedLevel) !==
        this.defaultStats.levelRewardLastClaimedLevel,
    );

    const hasDailyRewardProgress = Boolean(
      dailyReward?.lastClaimDate ||
      dailyReward?.claimedToday ||
      (dailyReward?.currentDay ?? this.defaultDailyReward.currentDay) !==
        this.defaultDailyReward.currentDay,
    );

    const hasAvatarProgress = Boolean(
      (avatar?.selectedAvatar ?? this.defaultAvatar.selectedAvatar) !==
        this.defaultAvatar.selectedAvatar ||
      (avatar?.unlockedAvatarIds?.length ?? 0) > 0,
    );

    const hasAuthRewardProgress = auth?.loginRewardClaimed === true;

    return (
      hasStatsProgress ||
      hasDailyRewardProgress ||
      hasAvatarProgress ||
      hasAuthRewardProgress
    );
  }

  async createProfileMigrationSnapshot(
    uid: string,
  ): Promise<UserProfileMigrationSnapshot> {
    /*
     * Prima di cambiare account salviamo in memoria tutto cio che appartiene
     * al profilo corrente. Se Google/Facebook esiste solo in Auth ma non ha progressi,
     * possiamo copiare questi dati sul nuovo UID senza perdere monete o reward.
     */
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);
    const subcollections: UserProfileMigrationSnapshot['subcollections'] = {};

    for (const collectionName of this.progressSubcollectionNames) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );
      const collectionSnapshot = await getDocs(collectionRef);

      subcollections[collectionName] = collectionSnapshot.docs.map(
        (document) => ({
          id: document.id,
          data: document.data() as Record<string, unknown>,
        }),
      );
    }

    return {
      uid,
      profile: snapshot.exists()
        ? (snapshot.data() as Record<string, unknown>)
        : null,
      subcollections,
    };
  }

  async restoreProfileSnapshotIntoLinkedAccount(
    user: User,
    snapshot: UserProfileMigrationSnapshot,
  ): Promise<void> {
    /*
     * Questo e il merge "cross UID": serve quando il profilo corrente
     * (ospite o Play Games) deve essere importato su un account Google/Facebook
     * che esiste in Firebase Auth ma non ha progressi salvati in TurtleMind.
     */
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const sourceProfile = snapshot.profile ?? {};
    const sourceAuth = (sourceProfile['auth'] ??
      {}) as Partial<UserAuthProfile>;
    const authProfile = this.getDefaultAuthProfile(user);
    const sourceCreatedFromProviderId =
      sourceAuth.createdFromProviderId ?? AUTH_CONFIG.providers.anonymous;

    await setDoc(
      userRef,
      {
        ...sourceProfile,
        uid: user.uid,
        displayName:
          user.displayName ??
          (sourceProfile['displayName'] as string | null | undefined) ??
          null,
        email: user.email,
        photoURL:
          user.photoURL ??
          (sourceProfile['photoURL'] as string | null | undefined) ??
          null,
        createdAt: sourceProfile['createdAt'] ?? serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        stats: {
          ...this.defaultStats,
          ...((sourceProfile['stats'] as Partial<UserStats> | undefined) ?? {}),
        },
        dailyReward: {
          ...this.defaultDailyReward,
          ...((sourceProfile['dailyReward'] as
            | Partial<UserDailyRewardData>
            | undefined) ?? {}),
        },
        avatar: {
          ...this.defaultAvatar,
          ...((sourceProfile['avatar'] as
            | Partial<UserAvatarData>
            | undefined) ?? {}),
        },
        auth: {
          ...sourceAuth,
          providerIds: authProfile.providerIds,
          createdFromProviderId: sourceCreatedFromProviderId,
          loginRewardClaimed: sourceAuth.loginRewardClaimed ?? false,
          lastMergeCheckedAt: serverTimestamp(),
          migratedFromUid: snapshot.uid,
          migratedFromProviderId: sourceCreatedFromProviderId,
          ...(sourceCreatedFromProviderId === AUTH_CONFIG.providers.anonymous
            ? { migratedFromAnonymousUid: snapshot.uid }
            : {}),
          migratedAt: serverTimestamp(),
        },
      },
      { merge: true },
    );

    for (const [collectionName, documents] of Object.entries(
      snapshot.subcollections,
    )) {
      for (const documentSnapshot of documents) {
        const targetRef = doc(
          this.firestore,
          `users/${user.uid}/${collectionName}/${documentSnapshot.id}`,
        );

        await setDoc(targetRef, documentSnapshot.data, { merge: true });
      }
    }
  }

  private async ensureProfileMigrationMarkers(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await setDoc(
      userRef,
      {
        auth: {
          lastMergeCheckedAt: serverTimestamp(),
        },
      },
      { merge: true },
    );
  }

  getUserProfile(uid: string): Observable<AppUserProfile | undefined> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return (docData(userRef) as Observable<AppUserProfile | undefined>).pipe(
      map((profile) => {
        if (!profile?.stats) return profile;

        return {
          ...profile,
          stats: {
            ...profile.stats,
            level: getLevelFromXp(profile.stats.xp),
          },
        };
      }),
    );
  }

  async userProfileExists(uid: string): Promise<boolean> {
    /*
     * Serve al bootstrap auth: su Android puo restare un utente anonimo locale
     * anche quando Firestore non ha piu il suo profilo. In quel caso lo
     * trattiamo come primo avvio e proviamo Play Games prima di ricrearlo.
     */
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);

    return snapshot.exists();
  }

  async getDailyRewardData(uid: string): Promise<UserDailyRewardData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      return this.defaultDailyReward;
    }

    const data = snapshot.data();
    const dailyReward = data['dailyReward'] as Partial<UserDailyRewardData>;

    if (!dailyReward) {
      await updateDoc(userRef, {
        dailyReward: this.defaultDailyReward,
      });

      return this.defaultDailyReward;
    }

    return {
      ...this.defaultDailyReward,
      ...dailyReward,
    };
  }

  async updateDailyRewardData(
    uid: string,
    data: Partial<UserDailyRewardData>,
  ): Promise<void> {
    const updatePayload: UpdateData<DocumentData> = {};

    for (const [key, value] of Object.entries(data)) {
      updatePayload[`dailyReward.${key}`] = value;
    }

    const userRef = doc(this.firestore, `users/${uid}`);

    await updateDoc(userRef, updatePayload);
  }

  async claimDailyReward(
    uid: string,
    todayKey: string,
    expectedRewardDay: number,
    maxRewardDay: number,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<UserDailyRewardData | null> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return null;

      const data = snapshot.data();
      const dailyReward = {
        ...this.defaultDailyReward,
        ...(data['dailyReward'] as Partial<UserDailyRewardData> | undefined),
      };

      if (dailyReward.lastClaimDate === todayKey) return null;

      const currentDay = Math.min(
        Math.max(dailyReward.currentDay ?? 1, 1),
        maxRewardDay,
      );

      if (
        currentDay !== expectedRewardDay ||
        rewardPayload.rewardDay !== expectedRewardDay
      ) {
        return null;
      }

      const nextDay = currentDay >= maxRewardDay ? 1 : currentDay + 1;

      const updatedDailyReward: UserDailyRewardData = {
        currentDay: nextDay,
        lastClaimDate: todayKey,
        claimedToday: true,
      };

      const updates: UpdateData<DocumentData> = {
        'dailyReward.currentDay': updatedDailyReward.currentDay,
        'dailyReward.lastClaimDate': updatedDailyReward.lastClaimDate,
        'dailyReward.claimedToday': updatedDailyReward.claimedToday,
      };

      if (rewardPayload.coins && rewardPayload.coins > 0) {
        const currentCoins =
          typeof data['stats']?.coins === 'number'
            ? data['stats'].coins
            : this.defaultStats.coins;

        updates['stats.coins'] = currentCoins + rewardPayload.coins;
      }

      if (rewardPayload.xp && rewardPayload.xp > 0) {
        const currentXp =
          typeof data['stats']?.xp === 'number'
            ? data['stats'].xp
            : this.defaultStats.xp;

        const updatedXp = currentXp + rewardPayload.xp;
        const updatedLevel = getLevelFromXp(updatedXp);

        updates['stats.xp'] = updatedXp;
        updates['stats.level'] = updatedLevel;
      }

      if (rewardPayload.avatarId) {
        const avatar = data['avatar'] as Partial<UserAvatarData> | undefined;
        const unlockedAvatarIds = Array.isArray(avatar?.unlockedAvatarIds)
          ? avatar.unlockedAvatarIds
          : [];

        updates['avatar.unlockedAvatarIds'] = unlockedAvatarIds.includes(
          rewardPayload.avatarId,
        )
          ? unlockedAvatarIds
          : [...unlockedAvatarIds, rewardPayload.avatarId];

        if (!avatar?.selectedAvatar) {
          updates['avatar.selectedAvatar'] = this.defaultAvatar.selectedAvatar;
        }
      }

      transaction.update(userRef, updates);

      return updatedDailyReward;
    });
  }

  async applyDailyRewardBonus(
    uid: string,
    rewardPayload: DailyRewardClaimPayload,
  ): Promise<boolean> {
    const userRef = doc(this.firestore, `users/${uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return false;

      const data = snapshot.data();
      const updates: UpdateData<DocumentData> = {};

      if (rewardPayload.coins && rewardPayload.coins > 0) {
        updates['stats.coins'] = increment(rewardPayload.coins);
      }

      if (rewardPayload.xp && rewardPayload.xp > 0) {
        const currentXp =
          typeof data['stats']?.xp === 'number'
            ? data['stats'].xp
            : this.defaultStats.xp;

        const updatedXp = currentXp + rewardPayload.xp;
        const updatedLevel = getLevelFromXp(updatedXp);

        updates['stats.xp'] = increment(rewardPayload.xp);
        updates['stats.level'] = updatedLevel;
      }

      if (Object.keys(updates).length === 0) return false;

      transaction.update(userRef, updates);

      return true;
    });
  }

  async getAvatarData(uid: string): Promise<UserAvatarData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      return this.defaultAvatar;
    }

    const data = snapshot.data();

    const avatar: UserAvatarData = {
      selectedAvatar:
        data['avatar']?.selectedAvatar ??
        data['selectedAvatar'] ??
        data['dailyReward']?.selectedAvatar ??
        'letter',
      unlockedAvatarIds:
        data['avatar']?.unlockedAvatarIds ??
        data['unlockedAvatarIds'] ??
        data['dailyReward']?.unlockedAvatarIds ??
        [],
    };

    if (!data['avatar']) {
      await updateDoc(userRef, {
        avatar,
      });
    }

    return avatar;
  }

  async unlockDailyAvatar(uid: string, avatarId: string): Promise<void> {
    const avatar = await this.getAvatarData(uid);

    if (avatar.unlockedAvatarIds.includes(avatarId)) {
      return;
    }

    await this.updateAvatarData(uid, {
      unlockedAvatarIds: [...avatar.unlockedAvatarIds, avatarId],
    });
  }

  async saveSelectedAvatar(uid: string, avatarId: string): Promise<void> {
    await this.updateAvatarData(uid, {
      selectedAvatar: avatarId,
    });
  }

  async updateAvatarData(
    uid: string,
    data: Partial<UserAvatarData>,
  ): Promise<void> {
    const updatePayload: UpdateData<DocumentData> = {};

    for (const [key, value] of Object.entries(data)) {
      updatePayload[`avatar.${key}`] = value;
    }

    const userRef = doc(this.firestore, `users/${uid}`);

    await updateDoc(userRef, updatePayload);
  }

  private getStartOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private getStartOfYesterday(): Date {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  }

  async recordQuizResult(
    uid: string,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();
      const stats = data['stats'];

      const currentBestScore = stats?.bestScore ?? 0;
      const currentXp = stats?.xp ?? 0;
      const currentStreakDays = stats?.streakDays ?? 0;
      const lastQuizPlayedAt = stats?.lastQuizPlayedAt;
      const todayStart = this.getStartOfToday();
      const yesterdayStart = this.getStartOfYesterday();

      let updatedStreakDays = currentStreakDays;

      if (!lastQuizPlayedAt?.toDate) {
        updatedStreakDays = 1;
      } else {
        const lastPlayedDate = lastQuizPlayedAt.toDate();
        lastPlayedDate.setHours(0, 0, 0, 0);

        if (lastPlayedDate.getTime() === todayStart.getTime()) {
          updatedStreakDays = currentStreakDays;
        } else if (lastPlayedDate.getTime() === yesterdayStart.getTime()) {
          updatedStreakDays = currentStreakDays + 1;
        } else {
          updatedStreakDays = 1;
        }
      }

      const xpEarned = correctAnswers * USER_STATS_CONFIG.xpPerCorrectAnswer;
      const updatedXp = currentXp + xpEarned;

      const updatedLevel = getLevelFromXp(updatedXp);

      transaction.update(userRef, {
        'stats.quizPlayed': increment(1),
        'stats.correctAnswers': increment(correctAnswers),
        'stats.wrongAnswers': increment(totalQuestions - correctAnswers),
        'stats.xp': increment(xpEarned),
        'stats.level': updatedLevel,
        'stats.bestScore': Math.max(currentBestScore, correctAnswers),
        'stats.streakDays': updatedStreakDays,
        'stats.lastQuizPlayedAt': serverTimestamp(),
      });
    });
  }

  async recordQuizHistory(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    await addDoc(historyRef, {
      categoryId,
      difficultyId,
      correctAnswers,
      totalQuestions,
      playedAt: serverTimestamp(),
    });
  }

  getRecentQuizHistory(
    uid: string,
    maxResults: number = 5,
  ): Observable<QuizHistoryItem[]> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    const historyQuery = query(
      historyRef,
      orderBy('playedAt', 'desc'),
      limit(maxResults),
    );

    return collectionData(historyQuery, {
      idField: 'id',
    }) as Observable<QuizHistoryItem[]>;
  }

  async addXp(uid: string, amount: number): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();
      const currentXp =
        typeof data['stats']?.xp === 'number'
          ? data['stats'].xp
          : this.defaultStats.xp;

      const updatedXp = currentXp + amount;
      const updatedLevel = getLevelFromXp(updatedXp);

      transaction.update(userRef, {
        'stats.xp': increment(amount),
        'stats.level': updatedLevel,
      });
    });
  }

  async claimLevelUpCoinsReward(
    uid: string,
    previousLevel: number,
    currentLevel: number,
    requestedCoinsReward: number,
  ): Promise<number> {
    if (currentLevel <= previousLevel || requestedCoinsReward <= 0) return 0;

    const userRef = doc(this.firestore, `users/${uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);

      if (!snapshot.exists()) return 0;

      const data = snapshot.data();
      const stats = data['stats'];
      const lastClaimedLevel =
        typeof stats?.levelRewardLastClaimedLevel === 'number'
          ? stats.levelRewardLastClaimedLevel
          : previousLevel;
      const rewardFromLevel = Math.max(lastClaimedLevel, previousLevel);
      const levelsToReward = Math.max(0, currentLevel - rewardFromLevel);

      if (levelsToReward <= 0) {
        transaction.update(userRef, {
          'stats.levelRewardLastClaimedLevel': Math.max(
            lastClaimedLevel,
            currentLevel,
          ),
        });

        return 0;
      }

      const coinsReward = levelsToReward * USER_STATS_CONFIG.levelUpCoinsReward;
      const doubledCoinsReward = coinsReward * 2;
      const safeCoinsReward =
        requestedCoinsReward >= doubledCoinsReward
          ? doubledCoinsReward
          : coinsReward;

      transaction.update(userRef, {
        'stats.coins': increment(safeCoinsReward),
        'stats.levelRewardLastClaimedLevel': currentLevel,
      });

      return safeCoinsReward;
    });
  }

  async deleteUserProfileData(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    for (const collectionName of this.progressSubcollectionNames) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );

      const snapshot = await getDocs(collectionRef);

      for (const document of snapshot.docs) {
        await deleteDoc(document.ref);
      }
    }

    await deleteDoc(userRef);
  }

  async resetUserDebugData(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    for (const collectionName of this.progressSubcollectionNames) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );

      const snapshot = await getDocs(collectionRef);

      for (const document of snapshot.docs) {
        await deleteDoc(document.ref);
      }
    }

    await updateDoc(userRef, {
      stats: {
        ...this.defaultStats,
        lastLifeUpdate: null,
      },
      dailyReward: this.defaultDailyReward,
      avatar: this.defaultAvatar,
    });
  }
}
