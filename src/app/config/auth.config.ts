import { AppAuthProviderId } from 'src/app/models/auth.model';

export const AUTH_CONFIG = {
  providers: {
    anonymous: 'anonymous' as AppAuthProviderId,
    playGames: 'playgames.google.com' as AppAuthProviderId,
    google: 'google.com' as AppAuthProviderId,
    facebook: 'facebook.com' as AppAuthProviderId,
  },

  playGames: {
    // Per ora resta spento: lo abilitiamo solo dopo configurazione Play Console/Firebase.
    enabled: false,
    autoSignInOnAndroid: true,
  },

  linkReward: {
    // TODO: decidere premio finale per incentivare il collegamento Google/Facebook.
    enabled: false,
    coins: 0,
    xp: 0,
  },
};
