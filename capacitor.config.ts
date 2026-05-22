import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.turtlemind.app',
  appName: 'TurtleMind',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    cleartext: true, // consente localhost su dispositivi/emulatori
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com', 'facebook.com', 'playgames.google.com'],

      // @ts-ignore
      google: {
        scopes: ['profile', 'email'],
        serverClientId:
          '419647253271-kohvq0q3git46j9me69clkd5p15r77n0.apps.googleusercontent.com', // 👈 il tuo Web client ID
      },

      // TODO Play Games: dopo la verifica Google Play Console/Firebase,
      // confermare che default_web_client_id e SHA debug/release siano corretti.
    },
  },
};

export default config;
