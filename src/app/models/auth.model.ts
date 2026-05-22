export type AppAuthProviderId =
  | 'anonymous'
  | 'playgames.google.com'
  | 'google.com'
  | 'facebook.com';

export interface AppAuthProviderInfo {
  id: AppAuthProviderId;
  label: string;
  shortLabel: string;
}

export interface UserAuthProfile {
  providerIds: AppAuthProviderId[];
  createdFromProviderId: AppAuthProviderId;
  loginRewardClaimed: boolean;
  lastMergeCheckedAt?: unknown;
  migratedFromUid?: string;
  migratedFromAnonymousUid?: string;
  migratedAt?: unknown;
}

export interface ProviderProfileMetadata {
  displayName?: string | null;
  photoURL?: string | null;
}

export type AccountConflictDecision = 'use-existing-profile' | 'keep-current';
