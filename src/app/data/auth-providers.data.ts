import {
  AppAuthProviderId,
  AppAuthProviderInfo,
} from 'src/app/models/auth.model';

export const AUTH_PROVIDERS: Record<AppAuthProviderId, AppAuthProviderInfo> = {
  anonymous: {
    id: 'anonymous',
    label: 'profilo ospite',
    shortLabel: 'Ospite',
  },
  'playgames.google.com': {
    id: 'playgames.google.com',
    label: 'Google Play Games',
    shortLabel: 'Play Games',
  },
  'google.com': {
    id: 'google.com',
    label: 'Google',
    shortLabel: 'Google',
  },
  'facebook.com': {
    id: 'facebook.com',
    label: 'Facebook',
    shortLabel: 'Facebook',
  },
};
