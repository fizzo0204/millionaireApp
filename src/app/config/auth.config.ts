import { AppAuthProviderId } from 'src/app/models/auth.model';

export const AUTH_CONFIG = {
  providers: {
    anonymous: 'anonymous' as AppAuthProviderId,
    playGames: 'playgames.google.com' as AppAuthProviderId,
    google: 'google.com' as AppAuthProviderId,
    facebook: 'facebook.com' as AppAuthProviderId,
  },

  playGames: {
    // Play Games diventa il profilo automatico su Android quando disponibile.
    enabled: true,
    autoSignInOnAndroid: true,
    applicationId: '419647253271',
  },

  linkReward: {
    // TODO: decidere premio finale per incentivare il collegamento Google/Facebook.
    enabled: false,
    coins: 0,
    xp: 0,
  },

  guestPrompt: {
    // Mostriamo il prompt solo ogni tanto quando l'ospite torna in home.
    homeCooldownMs: 15 * 60 * 1000,
    homeOpenDelayMs: 450,
    lastDismissedStorageKey: 'auth_guest_prompt_last_dismissed_at',
  },
};
