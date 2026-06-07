import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  docData,
  collection,
  getDocs,
  deleteDoc,
  DocumentData,
  UpdateData,
} from '@angular/fire/firestore';
import { User } from 'firebase/auth';
import { Observable, map } from 'rxjs';

import {
  AppUserProfile,
  UserArcadeData,
  UserAvatarData,
  UserOnboardingData,
  UserProfileMigrationSnapshot,
  UserStats,
} from 'src/app/models/user-stats.model';
import {
  AppAuthProviderId,
  ProviderProfileMetadata,
  UserAuthProfile,
} from 'src/app/models/auth.model';
import { UserDailyRewardData } from 'src/app/models/daily-reward.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import { getLevelFromXp } from 'src/app/utils/level-progress.util';

@Injectable({
  providedIn: 'root',
})
export class UserProfileDataService {
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
    const snapshot = await this.runFirestore(() => getDoc(userRef));
    const authProfile = this.getDefaultAuthProfile(user);

    if (!snapshot.exists()) {
      await this.runFirestore(() =>
        setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          stats: this.defaultStats,
          dailyReward: this.defaultDailyReward,
          avatar: this.defaultAvatar,
          onboarding: this.defaultOnboarding,
          arcade: this.defaultArcade,
          auth: authProfile,
        }),
      );

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

    if (!data['onboarding']) {
      updates['onboarding'] = this.defaultOnboarding;
    }

    if (!data['arcade']) {
      updates['arcade'] = this.defaultArcade;
    }

    updates['auth.providerIds'] = authProfile.providerIds;

    if (!data['auth']?.createdFromProviderId) {
      updates['auth.createdFromProviderId'] = authProfile.createdFromProviderId;
    }

    if (typeof data['auth']?.loginRewardClaimed !== 'boolean') {
      updates['auth.loginRewardClaimed'] = false;
    }

    await this.runFirestore(() => updateDoc(userRef, updates));
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
    const snapshot = await this.runFirestore(() => getDoc(userRef));
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

    await this.runFirestore(() =>
      setDoc(
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
      ),
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
    const arcade = profileData['arcade'] as Partial<UserArcadeData> | undefined;

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
    const hasArcadeProgress = Boolean(
      (arcade?.currentLevel ?? this.defaultArcade.currentLevel) !==
        this.defaultArcade.currentLevel ||
      (arcade?.bestLevel ?? this.defaultArcade.bestLevel) !==
        this.defaultArcade.bestLevel ||
      (arcade?.totalLevelsCompleted ??
        this.defaultArcade.totalLevelsCompleted) !==
        this.defaultArcade.totalLevelsCompleted,
    );

    return (
      hasStatsProgress ||
      hasDailyRewardProgress ||
      hasAvatarProgress ||
      hasAuthRewardProgress ||
      hasArcadeProgress
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
    const snapshot = await this.runFirestore(() => getDoc(userRef));
    const subcollections: UserProfileMigrationSnapshot['subcollections'] = {};

    for (const collectionName of this.progressSubcollectionNames) {
      const collectionRef = collection(
        this.firestore,
        `users/${uid}/${collectionName}`,
      );
      const collectionSnapshot = await this.runFirestore(() =>
        getDocs(collectionRef),
      );

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

    await this.runFirestore(() =>
      setDoc(
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
            ...((sourceProfile['stats'] as Partial<UserStats> | undefined) ??
              {}),
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
          arcade: {
            ...this.defaultArcade,
            ...((sourceProfile['arcade'] as
              | Partial<UserArcadeData>
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
      ),
    );

    for (const [collectionName, documents] of Object.entries(
      snapshot.subcollections,
    )) {
      for (const documentSnapshot of documents) {
        const targetRef = doc(
          this.firestore,
          `users/${user.uid}/${collectionName}/${documentSnapshot.id}`,
        );

        await this.runFirestore(() =>
          setDoc(targetRef, documentSnapshot.data, { merge: true }),
        );
      }
    }
  }
  async ensureProfileMigrationMarkers(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      setDoc(
        userRef,
        {
          auth: {
            lastMergeCheckedAt: serverTimestamp(),
          },
        },
        { merge: true },
      ),
    );
  }

  getUserProfile(uid: string): Observable<AppUserProfile | undefined> {
    return this.runFirestore(() => {
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
    });
  }

  async userProfileExists(uid: string): Promise<boolean> {
    /*
     * Serve al bootstrap auth: su Android puo restare un utente anonimo locale
     * anche quando Firestore non ha piu il suo profilo. In quel caso lo
     * trattiamo come primo avvio e proviamo Play Games prima di ricrearlo.
     */
    const snapshot = await this.runFirestore(async () => {
      const userRef = doc(this.firestore, `users/${uid}`);
      return getDoc(userRef);
    });

    return snapshot.exists();
  }

  async saveNickname(uid: string, nickname: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      updateDoc(userRef, {
        nickname,
      }),
    );
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
