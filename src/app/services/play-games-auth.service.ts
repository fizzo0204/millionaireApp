import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { AUTH_CONFIG } from 'src/app/config/auth.config';

@Injectable({
  providedIn: 'root',
})
export class PlayGamesAuthService {
  get canAttemptAutoSignIn(): boolean {
    return (
      AUTH_CONFIG.playGames.enabled &&
      AUTH_CONFIG.playGames.autoSignInOnAndroid &&
      Capacitor.getPlatform() === 'android'
    );
  }

  async tryAutoSignIn(): Promise<boolean> {
    if (!this.canAttemptAutoSignIn) {
      return false;
    }

    try {
      /*
       * TODO Play Games:
       * Il plugin Capacitor sa fare il login nativo con Play Games, ma il resto
       * dell'app usa Firebase Auth JS + AngularFire. Quando la console sara
       * pronta dobbiamo scegliere il ponte definitivo:
       * 1. usare una Cloud Function/custom token per portare Play Games dentro
       *    Firebase Auth JS, oppure
       * 2. migrare l'app a usare lo stato auth nativo del plugin anche per i dati.
       *
       * Per ora il codice resta preparato ma spento da AUTH_CONFIG.playGames.enabled.
       */
      const result = await FirebaseAuthentication.signInWithPlayGames();

      console.info('Login Play Games nativo completato:', result.user?.uid);

      return false;
    } catch (error) {
      console.warn('Login Play Games non disponibile:', error);
      return false;
    }
  }
}
