import {
  EnvironmentInjector,
  Injectable,
  runInInjectionContext,
} from '@angular/core';
import { Router } from '@angular/router';
import { User } from 'firebase/auth';
import {
  Firestore,
  DocumentData,
  UpdateData,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import {
  BehaviorSubject,
  catchError,
  filter,
  firstValueFrom,
  of,
  take,
  timeout,
} from 'rxjs';
import { TUTORIAL_CONFIG, TUTORIAL_STEPS } from 'src/app/config/tutorial.config';
import { STORAGE_KEYS } from 'src/app/config/storage-keys.config';
import { TutorialMode, TutorialState } from 'src/app/models/tutorial.model';
import { AuthService } from './auth.service';
import { DailyRewardService } from './daily-reward.service';
import { UserStatsService } from './user-stats.service';
import { UiService } from './ui.service';

@Injectable({
  providedIn: 'root',
})
export class TutorialService {
  private readonly initialState: TutorialState = {
    visible: false,
    stepIndex: 0,
    mode: 'auto',
    loading: false,
    completed: false,
    rewardClaimed: false,
    rewardGranted: false,
  };

  private readonly stateSubject = new BehaviorSubject<TutorialState>(
    this.initialState,
  );

  readonly state$ = this.stateSubject.asObservable();
  readonly steps = TUTORIAL_STEPS;

  constructor(
    private auth: AuthService,
    private firestore: Firestore,
    private injector: EnvironmentInjector,
    private router: Router,
    private dailyRewardService: DailyRewardService,
    private ui: UiService,
    private userStatsService: UserStatsService,
  ) {}

  getCurrentState(): TutorialState {
    return this.stateSubject.value;
  }

  async isTutorialPendingForCurrentUser(): Promise<boolean> {
    const user = await this.waitForUser();

    if (!user) return false;

    /*
     * Se il profilo Firestore e stato eliminato per un test/reset ma Firebase
     * Auth ha ancora la sessione, ricreiamo prima il documento completo.
     * Cosi il tutorial non prova mai a salvare su un profilo parziale.
     */
    const onboardingSnapshot = await this.readOnboardingState(user.uid);

    if (!onboardingSnapshot.profileExists) {
      this.clearLocalFlags(user.uid);
      await this.userStatsService.ensureUserProfile(user);
      const recreatedOnboarding = await this.readOnboardingState(user.uid);

      return (
        !recreatedOnboarding.state.completed &&
        !recreatedOnboarding.state.skipped
      );
    }

    const onboarding = onboardingSnapshot.state;

    if (!onboarding.completed && !onboarding.skipped) {
      this.clearLocalFlags(user.uid);
    }

    return !onboarding.completed && !onboarding.skipped;
  }

  async shouldOpenHomeTutorialForCurrentUser(): Promise<boolean> {
    if (!this.router.url.startsWith('/home')) return false;
    if (this.stateSubject.value.visible) return true;

    return this.isTutorialPendingForCurrentUser();
  }

  async openHomeTutorialIfNeeded(): Promise<boolean> {
    await this.wait(TUTORIAL_CONFIG.homeOpenDelayMs);

    if (!this.router.url.startsWith('/home')) return false;
    if (this.stateSubject.value.visible) return true;

    const user = await this.waitForUser();

    if (!user) return false;

    const onboardingSnapshot = await this.readOnboardingState(user.uid);
    let onboarding = onboardingSnapshot.state;

    if (!onboardingSnapshot.profileExists) {
      this.clearLocalFlags(user.uid);
      await this.userStatsService.ensureUserProfile(user);
      onboarding = (await this.readOnboardingState(user.uid)).state;
    } else if (!onboarding.completed && !onboarding.skipped) {
      this.clearLocalFlags(user.uid);
    }

    if (onboarding.completed || onboarding.skipped) return false;

    this.open('auto', onboarding.rewardClaimed);
    return true;
  }

  async openManualTutorial(): Promise<void> {
    const user = await this.waitForUser();

    if (user) {
      await this.userStatsService.ensureUserProfile(user);
    }

    const onboarding = user
      ? await this.getOnboardingState(user.uid)
      : {
          completed: false,
          skipped: false,
          rewardClaimed: false,
        };

    this.open('manual', onboarding.rewardClaimed);
  }

  async openDebugFreshTutorial(): Promise<void> {
    const user = await this.waitForUser();

    /*
     * Strumento solo debug: riporta il tutorial allo stato "primo avvio"
     * e permette di testare di nuovo la ricompensa finale.
     */
    if (user) {
      await this.userStatsService.ensureUserProfile(user);
      await this.resetTutorialStateForDebug(user.uid);
    }

    this.open('manual', false);
  }

  nextStep(): void {
    const current = this.stateSubject.value;

    if (current.loading) return;

    this.stateSubject.next({
      ...current,
      stepIndex: Math.min(current.stepIndex + 1, this.steps.length - 1),
    });
  }

  previousStep(): void {
    const current = this.stateSubject.value;

    if (current.loading) return;

    this.stateSubject.next({
      ...current,
      stepIndex: Math.max(current.stepIndex - 1, 0),
    });
  }

  async skip(): Promise<void> {
    const current = this.stateSubject.value;

    if (current.loading) return;

    let uid: string | null = null;

    try {
      const user = await this.waitForUser();

      if (user) {
        uid = user.uid;
        await this.userStatsService.ensureUserProfile(user);
        await this.markSkipped(user.uid);
      }
    } catch (error) {
      console.warn('Tutorial saltato senza salvataggio remoto:', error);

      if (uid) {
        this.setLocalFlag(uid, 'skipped');
      }
    } finally {
      this.close();
    }
  }

  async completeTutorial(): Promise<void> {
    const current = this.stateSubject.value;

    if (current.loading) return;

    this.stateSubject.next({
      ...current,
      loading: true,
    });

    try {
      const user = await this.waitForUser();
      let rewardGranted = false;
      let rewardClaimed = current.rewardClaimed;

      if (user) {
        await this.userStatsService.ensureUserProfile(user);
        const result = await this.markCompletedAndClaimReward(user.uid);
        rewardGranted = result.rewardGranted;
        rewardClaimed = result.rewardClaimed;

        await this.dailyRewardService.refreshAvatarCacheForCurrentUser();
      }

      this.stateSubject.next({
        ...this.stateSubject.value,
        loading: false,
        completed: true,
        rewardGranted,
        rewardClaimed,
      });
    } catch (error) {
      console.warn('Tutorial non completato correttamente:', error);
      this.stateSubject.next({
        ...this.stateSubject.value,
        loading: false,
      });
    }
  }

  close(): void {
    this.ui.closeModalOverlay();
    this.stateSubject.next({
      ...this.initialState,
    });
  }

  private open(mode: TutorialMode, rewardClaimed: boolean): void {
    this.ui.openModalOverlay();
    this.stateSubject.next({
      ...this.initialState,
      visible: true,
      mode,
      rewardClaimed,
    });
  }

  private async waitForUser(): Promise<User | null> {
    return firstValueFrom(
      this.auth.user$.pipe(
        filter((user): user is User => !!user),
        take(1),
        timeout({
          first: TUTORIAL_CONFIG.authWaitTimeoutMs,
          with: () => of(null),
        }),
        catchError(() => of(null)),
      ),
    );
  }

  private async getOnboardingState(uid: string): Promise<{
    completed: boolean;
    skipped: boolean;
    rewardClaimed: boolean;
  }> {
    return (await this.readOnboardingState(uid)).state;
  }

  private async readOnboardingState(uid: string): Promise<{
    profileExists: boolean;
    state: {
      completed: boolean;
      skipped: boolean;
      rewardClaimed: boolean;
    };
  }> {
    const profile = await firstValueFrom(
      this.userStatsService.getUserProfile(uid).pipe(take(1)),
    );

    const onboarding = profile?.onboarding;

    if (onboarding) {
      return {
        profileExists: true,
        state: {
          completed: onboarding.tutorialCompleted === true,
          skipped: onboarding.tutorialSkipped === true,
          rewardClaimed: onboarding.tutorialRewardClaimed === true,
        },
      };
    }

    return {
      profileExists: Boolean(profile),
      state: {
        completed: false,
        skipped: false,
        rewardClaimed: false,
      },
    };
  }

  private async markSkipped(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await this.runFirestore(() => getDoc(userRef));
    const payload = {
      'onboarding.tutorialSkipped': true,
      'onboarding.tutorialSkippedAt': serverTimestamp(),
      'onboarding.tutorialCompleted': false,
    };

    if (snapshot.exists()) {
      await this.runFirestore(() => updateDoc(userRef, payload));
    } else {
      await this.runFirestore(() => setDoc(
        userRef,
        {
          onboarding: {
            tutorialCompleted: false,
            tutorialRewardClaimed: false,
            tutorialSkipped: true,
            tutorialSkippedAt: serverTimestamp(),
          },
        },
        { merge: true },
      ));
    }

    this.setLocalFlag(uid, 'skipped');
  }

  private async resetTutorialStateForDebug(uid: string): Promise<void> {
    this.clearLocalFlags(uid);

    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() => setDoc(
      userRef,
      {
        onboarding: {
          tutorialCompleted: false,
          tutorialRewardClaimed: false,
          tutorialSkipped: false,
          tutorialCompletedAt: null,
          tutorialSkippedAt: null,
        },
      },
      { merge: true },
    ));
  }

  private async markCompletedAndClaimReward(uid: string): Promise<{
    rewardGranted: boolean;
    rewardClaimed: boolean;
  }> {
    const userRef = doc(this.firestore, `users/${uid}`);
    let rewardGranted = false;

    await this.runFirestore(() => runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const data = snapshot.exists() ? snapshot.data() : {};
      const onboarding = (data['onboarding'] ?? {}) as Record<string, unknown>;
      const rewardAlreadyClaimed =
        onboarding['tutorialRewardClaimed'] === true;
      const stats = data['stats'] as { coins?: number } | undefined;
      const avatar = data['avatar'] as
        | { selectedAvatar?: string; unlockedAvatarIds?: string[] }
        | undefined;
      const unlockedAvatarIds = Array.isArray(avatar?.unlockedAvatarIds)
        ? avatar.unlockedAvatarIds
        : [];
      const avatarAlreadyUnlocked = unlockedAvatarIds.includes(
        TUTORIAL_CONFIG.rewardAvatarId,
      );

      rewardGranted = !rewardAlreadyClaimed;

      const updates: UpdateData<DocumentData> = {
        'onboarding.tutorialCompleted': true,
        'onboarding.tutorialCompletedAt': serverTimestamp(),
        'onboarding.tutorialSkipped': false,
      };

      if (rewardGranted) {
        updates['onboarding.tutorialRewardClaimed'] = true;
        updates['stats.coins'] =
          (stats?.coins ?? this.userStatsService.defaultStats.coins) +
          TUTORIAL_CONFIG.rewardCoins;
      }

      if (rewardGranted || !avatarAlreadyUnlocked) {
        updates['avatar.unlockedAvatarIds'] = unlockedAvatarIds.includes(
          TUTORIAL_CONFIG.rewardAvatarId,
        )
          ? unlockedAvatarIds
          : [...unlockedAvatarIds, TUTORIAL_CONFIG.rewardAvatarId];

        if (!avatar?.selectedAvatar || avatar.selectedAvatar === 'letter') {
          updates['avatar.selectedAvatar'] = TUTORIAL_CONFIG.rewardAvatarId;
        }
      }

      if (!snapshot.exists()) return;

      transaction.update(userRef, updates);
    }));

    this.setLocalFlag(uid, 'completed');
    this.setLocalFlag(uid, 'reward_claimed');

    return {
      rewardGranted,
      rewardClaimed: true,
    };
  }

  private getLocalFlag(uid: string, name: string): boolean {
    return (
      localStorage.getItem(this.getLocalStorageKey(uid, name)) === 'true'
    );
  }

  private setLocalFlag(uid: string, name: string): void {
    localStorage.setItem(this.getLocalStorageKey(uid, name), 'true');
  }

  private clearLocalFlags(uid: string): void {
    ['completed', 'skipped', 'reward_claimed'].forEach((name) => {
      localStorage.removeItem(this.getLocalStorageKey(uid, name));
    });
  }

  private getLocalStorageKey(uid: string, name: string): string {
    return `${STORAGE_KEYS.tutorialOnboarding}_${uid}_${name}`;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
