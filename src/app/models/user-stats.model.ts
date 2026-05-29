import { DifficultyId } from './difficulty.model';
import { UserAuthProfile } from './auth.model';

export interface UserStats {
  quizPlayed: number;
  correctAnswers: number;
  wrongAnswers: number;
  bestScore: number;
  streakDays: number;
  lastQuizPlayedAt: unknown;
  lastLifeUpdate?: unknown;
  xp: number;
  level: number;
  levelRewardLastClaimedLevel?: number;
  coins: number;
  lives: number;
}

export interface UserAvatarData {
  selectedAvatar: string;
  unlockedAvatarIds: string[];
}

export interface UserOnboardingData {
  tutorialCompleted: boolean;
  tutorialRewardClaimed: boolean;
  tutorialSkipped?: boolean;
  tutorialCompletedAt?: unknown;
  tutorialSkippedAt?: unknown;
}

export interface AppUserProfile {
  uid: string;
  displayName: string | null;
  nickname?: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: unknown;
  lastLoginAt: unknown;
  stats: UserStats;
  avatar: UserAvatarData;
  auth?: UserAuthProfile;
  onboarding?: UserOnboardingData;
}

export interface QuizHistoryItem {
  categoryId: string;
  difficultyId: DifficultyId;
  correctAnswers: number;
  totalQuestions: number;
  playedAt: unknown;
}

export interface UserProfileDocumentSnapshot {
  id: string;
  data: Record<string, unknown>;
}

export interface UserProfileMigrationSnapshot {
  uid: string;
  profile: Record<string, unknown> | null;
  subcollections: Record<string, UserProfileDocumentSnapshot[]>;
}
