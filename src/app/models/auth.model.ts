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
  migratedFromProviderId?: AppAuthProviderId;
  migratedFromAnonymousUid?: string;
  migratedAt?: unknown;
  /*
   * true solo dopo un vero collegamento Google confermato dall'utente (mai
   * dal solo companion google.com di Play Games, sempre presente in
   * providerIds anche senza collegamento esplicito - vedi AuthService).
   * Usato per decidere se il badge in navbar deve mostrare GOOGLE invece di
   * PLAY GAMES.
   */
  googleLinkConfirmed?: boolean;
}

export interface ProviderProfileMetadata {
  displayName?: string | null;
  photoURL?: string | null;
}

export type AccountConflictDecision = 'use-existing-profile' | 'keep-current';
