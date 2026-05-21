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
  migratedFromAnonymousUid?: string;
  migratedAt?: unknown;
}

export type AccountConflictDecision = 'use-existing-profile' | 'keep-current';
