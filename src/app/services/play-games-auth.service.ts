import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import type { AuthCredential as NativeAuthCredential } from '@capacitor-firebase/authentication';
import { AuthCredential, signInWithCredential, User } from 'firebase/auth';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import { firebaseAuth } from 'src/app/config/firebase.config';
import { ProviderProfileMetadata } from 'src/app/models/auth.model';
import { environment } from 'src/environments/environment';
import { UserStatsService } from './user-stats.service';

interface PlayGamesNativeCredentialPayload {
  idToken?: string;
  serverAuthCode?: string;
}

interface IdentityToolkitIdTokenResponse {
  federatedId?: string;
  providerId?: string;
  localId: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoUrl?: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  rawUserInfo?: string;
  isNewUser?: boolean;
  kind?: string;
}

export interface PlayGamesCredentialResult {
  credential: AuthCredential;
  profile: ProviderProfileMetadata;
}

@Injectable({
  providedIn: 'root',
})
export class PlayGamesAuthService {
  constructor(private userStatsService: UserStatsService) {}

  get canUsePlayGames(): boolean {
    return AUTH_CONFIG.playGames.enabled && Capacitor.getPlatform() === 'android';
  }

  get canAttemptAutoSignIn(): boolean {
    return this.canUsePlayGames && AUTH_CONFIG.playGames.autoSignInOnAndroid;
  }

  async tryAutoSignIn(): Promise<User | null> {
    if (!this.canAttemptAutoSignIn) {
      return null;
    }

    try {
      const playGamesResult =
        await this.createFirebaseCredentialFromNativeSignIn();

      if (!playGamesResult) {
        return null;
      }

      const signedInUser = await signInWithCredential(
        firebaseAuth,
        playGamesResult.credential,
      );

      await this.userStatsService.ensureUserProfile(signedInUser.user);
      await this.userStatsService.markPlayGamesProfile(
        signedInUser.user.uid,
        playGamesResult.profile,
      );

      console.info('Login Play Games completato:', signedInUser.user.uid);

      return signedInUser.user;
    } catch (error) {
      console.warn('Login Play Games non disponibile:', error);
      return null;
    }
  }

  async createFirebaseCredentialFromNativeSignIn(): Promise<PlayGamesCredentialResult | null> {
    if (!this.canUsePlayGames) {
      return null;
    }

    /*
     * Chiediamo a Play Games il token nativo senza completare il login nel
     * layer Android. L'app usa Firebase JS/AngularFire per Firestore, quindi
     * dobbiamo creare la sessione anche nel Firebase JS SDK.
     */
    const result = await FirebaseAuthentication.signInWithPlayGames({
      skipNativeAuth: true,
    });

    console.info('Play Games credential ricevuta:', {
      hasIdToken: Boolean(result.credential?.idToken),
      hasServerAuthCode: Boolean(result.credential?.serverAuthCode),
      providerId: result.credential?.providerId,
      displayName: result.user?.displayName ?? null,
    });

    const profile = this.getNativePlayGamesProfileFromResult(result);
    const credential = this.createFirebaseCredential(result.credential, profile);

    if (!credential) {
      console.warn(
        'Play Games ha risposto, ma mancano idToken e serverAuthCode per Firebase.',
      );
    }

    if (!credential) {
      return null;
    }

    return {
      credential,
      profile,
    };
  }

  async getNativePlayGamesProfile(): Promise<ProviderProfileMetadata | null> {
    if (!this.canUsePlayGames) {
      return null;
    }

    /*
     * Utile per profili Play Games gia collegati prima del salvataggio del
     * nickname: chiediamo al layer nativo l'account ricordato e usiamo solo i
     * dati profilo, senza cambiare sessione Firebase.
     */
    const result = await FirebaseAuthentication.signInWithPlayGames({
      skipNativeAuth: true,
    });

    return this.getNativePlayGamesProfileFromResult(result);
  }

  private getNativePlayGamesProfileFromResult(result: {
    user?: { displayName?: string | null; photoUrl?: string | null } | null;
    additionalUserInfo?: { profile?: Record<string, unknown> } | null;
  }): ProviderProfileMetadata {
    /*
     * Il nickname Play Games arriva spesso solo dal layer nativo.
     * Lo portiamo in Firestore per evitare che il profilo collegato resti
     * visualmente "anonimo" anche se l'account Play Games e corretto.
     */
    const profile = result.additionalUserInfo?.profile;
    const displayName =
      result.user?.displayName ??
      this.getStringProfileValue(profile, [
        'displayName',
        'display_name',
        'name',
        'playerName',
        'player_name',
        'nickname',
      ]);
    const photoURL =
      result.user?.photoUrl ??
      this.getStringProfileValue(profile, [
        'photoURL',
        'photoUrl',
        'photo_url',
        'avatar',
        'picture',
      ]);

    return {
      displayName,
      photoURL,
    };
  }

  private getStringProfileValue(
    profile: Record<string, unknown> | undefined,
    keys: string[],
  ): string | null {
    if (!profile) return null;

    for (const key of keys) {
      const value = profile[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  }

  private createFirebaseCredential(
    nativeCredential: NativeAuthCredential | null,
    profile: ProviderProfileMetadata,
  ): AuthCredential | null {
    /*
     * Firebase Android usa PlayGamesAuthProvider.getCredential(serverAuthCode),
     * ma il Firebase JS SDK non espone PlayGamesAuthProvider. Creiamo quindi
     * una credenziale compatibile con signInWithCredential che scambia
     * serverAuthCode/idToken tramite l'endpoint REST ufficiale signInWithIdp.
     */
    const payload: PlayGamesNativeCredentialPayload = {
      idToken: nativeCredential?.idToken,
      serverAuthCode: nativeCredential?.serverAuthCode,
    };

    if (!payload.idToken && !payload.serverAuthCode) {
      return null;
    }

    const providerId = AUTH_CONFIG.providers.playGames;

    return {
      providerId,
      signInMethod: providerId,
      toJSON: () => ({
        providerId,
        signInMethod: providerId,
        idToken: payload.idToken,
        serverAuthCode: payload.serverAuthCode,
      }),
      _getIdTokenResponse: () =>
        this.signInWithPlayGamesCredential(payload, undefined, true, profile),
      _linkToIdToken: (_auth: unknown, currentFirebaseIdToken: string) =>
        this.signInWithPlayGamesCredential(
          payload,
          currentFirebaseIdToken,
          true,
          profile,
        ),
      _getReauthenticationResolver: () =>
        this.signInWithPlayGamesCredential(payload, undefined, false, profile),
    } as unknown as AuthCredential;
  }

  private async signInWithPlayGamesCredential(
    payload: PlayGamesNativeCredentialPayload,
    currentFirebaseIdToken?: string,
    autoCreate = true,
    profile?: ProviderProfileMetadata,
  ): Promise<IdentityToolkitIdTokenResponse> {
    const attempts: Array<Record<string, string>> = [];

    if (payload.serverAuthCode) {
      /*
       * Questo e il formato che Firebase Android usa internamente per
       * Play Games: il codice server viene scambiato con una sessione Firebase.
       */
      attempts.push({ code: payload.serverAuthCode });
    }

    if (payload.idToken) {
      attempts.push({ id_token: payload.idToken });
    }

    let lastError: unknown = null;

    for (const credentialBody of attempts) {
      try {
        const response = await this.callSignInWithIdp(
          credentialBody,
          currentFirebaseIdToken,
          autoCreate,
        );

        this.mergeIdentityToolkitProfile(profile, response);

        return response;
      } catch (error) {
        lastError = error;
        console.warn('Scambio Play Games con Firebase non riuscito:', error);
      }
    }

    throw lastError ?? new Error('Credenziale Play Games non valida');
  }

  private async callSignInWithIdp(
    credentialBody: Record<string, string>,
    currentFirebaseIdToken?: string,
    autoCreate = true,
  ): Promise<IdentityToolkitIdTokenResponse> {
    const postBody = new URLSearchParams({
      ...credentialBody,
      providerId: AUTH_CONFIG.providers.playGames,
    }).toString();

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${environment.firebase.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestUri: 'http://localhost',
          postBody,
          returnSecureToken: true,
          returnIdpCredential: true,
          autoCreate,
          ...(currentFirebaseIdToken
            ? { idToken: currentFirebaseIdToken }
            : {}),
        }),
      },
    );

    const body = await response.json();

    if (!response.ok) {
      const message =
        body?.error?.message ?? 'PLAY_GAMES_FIREBASE_EXCHANGE_FAILED';
      const error = new Error(message);

      (error as Error & { code?: string; customData?: unknown }).code =
        `auth/${String(message).toLowerCase().replace(/_/g, '-')}`;
      (error as Error & { code?: string; customData?: unknown }).customData =
        body;

      throw error;
    }

    return body as IdentityToolkitIdTokenResponse;
  }

  private mergeIdentityToolkitProfile(
    profile: ProviderProfileMetadata | undefined,
    response: IdentityToolkitIdTokenResponse,
  ): void {
    if (!profile) return;

    const rawUserInfo = this.parseRawUserInfo(response.rawUserInfo);
    const displayName =
      response.displayName ??
      this.getStringProfileValue(rawUserInfo, [
        'displayName',
        'display_name',
        'name',
        'playerName',
        'player_name',
        'nickname',
      ]);
    const photoURL =
      response.photoUrl ??
      this.getStringProfileValue(rawUserInfo, [
        'photoURL',
        'photoUrl',
        'photo_url',
        'avatar',
        'picture',
      ]);

    if (!profile.displayName && displayName) {
      profile.displayName = displayName;
    }

    if (!profile.photoURL && photoURL) {
      profile.photoURL = photoURL;
    }
  }

  private parseRawUserInfo(
    rawUserInfo?: string,
  ): Record<string, unknown> | undefined {
    if (!rawUserInfo) return undefined;

    try {
      const parsed = JSON.parse(rawUserInfo);

      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
}
