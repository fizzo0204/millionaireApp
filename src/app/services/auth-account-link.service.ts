import { Injectable } from '@angular/core';
import {
  AuthCredential,
  deleteUser,
  getAdditionalUserInfo,
  getAuth as getFirebaseAuth,
  signInWithCredential,
  signOut as signOutFirebaseAuth,
} from 'firebase/auth';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  collection as firestoreCollection,
  doc as firestoreDoc,
  getDoc as getFirestoreDoc,
  getDocs as getFirestoreDocs,
  getFirestore as getFirebaseFirestore,
  setDoc as setFirestoreDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseAuth } from 'src/app/config/firebase.config';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import {
  AccountConflictComparison,
  AppAuthProviderId,
  UserAuthProfile,
} from 'src/app/models/auth.model';
import { UserProfileMigrationSnapshot } from 'src/app/models/user-stats.model';
import { environment } from 'src/environments/environment';
import { UserStatsService } from './user-stats.service';
import { AccountLinkService } from './account-link.service';

export interface ExistingProviderProfileState {
  uid: string;
  profileExists: boolean;
  hasSavedProgress: boolean;
  // Monete/XP del profilo trovato, per mostrarli nella modale di conflitto
  // a confronto con quelli del profilo attuale: 0 se il profilo non esiste.
  coins: number;
  xp: number;
  /*
   * Presente quando questo provider (Google) non ha un vero profilo, ma solo
   * un segnaposto scritto da claimGoogleCompanionCredential(): l'utente
   * proprietario e' questo uid, non quello (vuoto) trovato dal check.
   */
  companionClaimOwnerUid?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthAccountLinkService {
  constructor(
    private userStatsService: UserStatsService,
    private accountLinkService: AccountLinkService,
  ) {}

  // Verifica, tramite una Firebase app temporanea, se il provider ha già un profilo TurtleMind.
  async getExistingProviderProfileState(
    credential: AuthCredential,
  ): Promise<ExistingProviderProfileState | null> {
    const tempAppName = `provider-profile-check-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const tempApp = initializeApp(environment.firebase, tempAppName);
    const tempAuth = getFirebaseAuth(tempApp);
    let createdNewAuthUser = false;

    try {
      const existingUser = await signInWithCredential(tempAuth, credential);

      /*
       * signInWithCredential crea automaticamente un utente Firebase Auth se
       * il provider non ne aveva ancora uno: qui stiamo solo controllando,
       * quindi se lo ha appena creato lo segnamo per eliminarlo nel finally,
       * evitando di lasciare account "fantasma" senza profilo TurtleMind.
       */
      createdNewAuthUser =
        getAdditionalUserInfo(existingUser)?.isNewUser === true;

      const tempFirestore = getFirebaseFirestore(tempApp);
      const userRef = firestoreDoc(
        tempFirestore,
        `users/${existingUser.user.uid}`,
      );
      const profileSnapshot = await getFirestoreDoc(userRef);
      let hasSubcollectionData = false;

      for (const collectionName of this.userStatsService
        .progressSubcollectionNames) {
        const collectionRef = firestoreCollection(
          tempFirestore,
          `users/${existingUser.user.uid}/${collectionName}`,
        );
        const collectionSnapshot = await getFirestoreDocs(collectionRef);

        if (!collectionSnapshot.empty) {
          hasSubcollectionData = true;
          break;
        }
      }

      const profileData = profileSnapshot.exists()
        ? profileSnapshot.data()
        : undefined;
      const stats = profileData?.['stats'] as
        | { coins?: unknown; xp?: unknown }
        | undefined;

      return {
        uid: existingUser.user.uid,
        profileExists: profileSnapshot.exists(),
        hasSavedProgress:
          profileSnapshot.exists() &&
          this.userStatsService.hasMeaningfulSavedProgress(
            profileData,
            hasSubcollectionData,
          ),
        coins:
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.userStatsService.defaultStats.coins,
        xp:
          typeof stats?.xp === 'number'
            ? stats.xp
            : this.userStatsService.defaultStats.xp,
        companionClaimOwnerUid: profileData?.['companionClaimOwnerUid'] as
          | string
          | undefined,
      };
    } catch (error) {
      console.warn(
        'Non riesco a verificare i progressi del provider esistente',
        error,
      );
      return null;
    } finally {
      if (createdNewAuthUser && tempAuth.currentUser) {
        try {
          await deleteUser(tempAuth.currentUser);
        } catch (error) {
          console.warn(
            "Non sono riuscito a ripulire l'account temporaneo creato dal controllo:",
            error,
          );
        }
      } else {
        try {
          await signOutFirebaseAuth(tempAuth);
        } catch {
          // La app temporanea potrebbe non aver completato il login: va bene cosi.
        }
      }

      try {
        await deleteApp(tempApp);
      } catch {
        // Evita rumore in console se Firebase ha gia pulito la app temporanea.
      }
    }
  }

  /*
   * Registra, tramite una Firebase app temporanea, che una credenziale
   * Google (di solito il companion di Play Games, mai davvero collegata a
   * livello di Firebase Auth - vedi AuthService.googleSignIn) appartiene di
   * fatto a ownerUid. Senza questo passo, un tentativo successivo di
   * collegare la stessa credenziale da una sessione diversa (es. dopo un
   * logout) non trova nulla di registrato lato Firebase e crea un account
   * duplicato invece di riconoscere il collegamento gia' confermato -
   * riscontrato su device il 2026-08-19.
   *
   * A differenza di getExistingProviderProfileState(), l'account Firebase
   * Auth creato da questo controllo NON viene eliminato: deve restare come
   * segnaposto permanente. Se pero' esiste gia' un vero profilo altrove (con
   * dati di gioco reali, non solo il nostro segnaposto), non lo tocchiamo:
   * quel caso raro resta un limite noto, da gestire con il flusso di
   * conflitto normale se mai si ripresenta.
   */
  async claimGoogleCompanionCredential(
    credential: AuthCredential,
    ownerUid: string,
  ): Promise<void> {
    const tempAppName = `google-companion-claim-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const tempApp = initializeApp(environment.firebase, tempAppName);
    const tempAuth = getFirebaseAuth(tempApp);

    try {
      const signedIn = await signInWithCredential(tempAuth, credential);
      const tempFirestore = getFirebaseFirestore(tempApp);
      const userRef = firestoreDoc(
        tempFirestore,
        `users/${signedIn.user.uid}`,
      );
      const snapshot = await getFirestoreDoc(userRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        const isOwnMarker = data?.['companionClaimOwnerUid'] === ownerUid;
        const hasRealProfile =
          !isOwnMarker && data?.['companionClaimOwnerUid'] === undefined;

        if (hasRealProfile) {
          console.warn(
            'Companion Google gia associato a un profilo reale, segnaposto non scritto:',
            signedIn.user.uid,
          );
          return;
        }
      }

      await setFirestoreDoc(
        userRef,
        {
          companionClaimOwnerUid: ownerUid,
          companionClaimUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      console.warn(
        'Registrazione companion Google non riuscita (non bloccante):',
        error,
      );
    } finally {
      try {
        await signOutFirebaseAuth(tempAuth);
      } catch {
        // La app temporanea potrebbe non aver completato il login: va bene cosi.
      }

      try {
        await deleteApp(tempApp);
      } catch {
        // Evita rumore in console se Firebase ha gia pulito la app temporanea.
      }
    }
  }

  // Mostra la modale di conferma quando il provider scelto ha già un profilo salvato.
  async confirmExistingProviderSwitch(
    providerId: AppAuthProviderId,
    comparison: AccountConflictComparison,
  ): Promise<boolean> {
    const decision = await this.accountLinkService.confirmExistingAccountSwitch(
      providerId,
      comparison,
    );

    return decision === 'use-existing-profile';
  }

  // Prova a eliminare il profilo ospite prima del cambio account, quando l'utente è ancora owner.
  async deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
    profileSnapshot: UserProfileMigrationSnapshot | null,
  ): Promise<boolean> {
    if (!profileSnapshot) return false;
    if (!this.isAnonymousOnlySnapshot(profileSnapshot)) return false;

    /*
     * NON blocchiamo piu' qui su firebaseAuth.currentUser?.uid !== profileSnapshot.uid:
     * tra la cattura dello snapshot e questa chiamata possono passare diversi
     * secondi (fino a due flussi nativi Play Games in sequenza, che portano
     * l'utente fuori dall'app verso l'account picker di sistema - vedi
     * CLAUDE.md sulle interferenze Android durante il backgrounding). Un
     * controllo troppo rigido qui bloccava la cancellazione in silenzio
     * (nessun log, solo un return false) anche quando l'operazione sarebbe
     * comunque riuscita. Le firestore.rules restano la vera protezione: se
     * non siamo davvero piu' autenticati come quell'uid, l'operazione fallira'
     * con un errore che ora logghiamo, invece di abortire prima di provare.
     */
    for (let tentativo = 1; tentativo <= 2; tentativo++) {
      try {
        await this.userStatsService.deleteUserProfileData(profileSnapshot.uid);
        return true;
      } catch (error) {
        if (tentativo === 2) {
          console.error(
            `Profilo ospite non eliminato prima del cambio account (uid ${profileSnapshot.uid}), dopo ${tentativo} tentativi:`,
            error,
          );
          return false;
        }
      }
    }

    return false;
  }

  // Fallback non bloccante: elimina il profilo ospite dopo il cambio account, se le rules lo permettono.
  async deleteProfileSnapshotIfAnonymous(
    profileSnapshot: UserProfileMigrationSnapshot | null,
    targetUid?: string,
  ): Promise<void> {
    if (!profileSnapshot) return;
    if (targetUid && profileSnapshot.uid === targetUid) return;
    if (!this.isAnonymousOnlySnapshot(profileSnapshot)) return;

    try {
      await this.userStatsService.deleteUserProfileData(profileSnapshot.uid);
    } catch (error) {
      console.warn(
        'Profilo ospite non eliminato dopo il cambio account:',
        error,
      );
    }
  }

  // Riconosce se lo snapshot appartiene a un profilo solo ospite, quindi eliminabile.
  private isAnonymousOnlySnapshot(
    profileSnapshot: UserProfileMigrationSnapshot,
  ): boolean {
    /*
     * Caso principale: se Firebase Auth e ancora anonimo e l'UID corrente
     * coincide con lo snapshot, possiamo eliminarlo prima del cambio account.
     * Questo evita di provare a cancellare users/{uidAnonimo} dopo essere gia
     * passati a Google/Facebook, cosa che le rules bloccano correttamente.
     */
    const currentUser = firebaseAuth.currentUser;

    if (currentUser?.isAnonymous && currentUser.uid === profileSnapshot.uid) {
      return true;
    }

    const auth = (profileSnapshot.profile?.['auth'] ??
      {}) as Partial<UserAuthProfile>;
    const providerIds = auth.providerIds ?? [];
    const createdFromProviderId = auth.createdFromProviderId;
    const strongProviderIds = [
      AUTH_CONFIG.providers.google,
      AUTH_CONFIG.providers.facebook,
      AUTH_CONFIG.providers.playGames,
    ];

    if (
      createdFromProviderId &&
      strongProviderIds.includes(createdFromProviderId)
    ) {
      return false;
    }

    if (
      providerIds.some((providerId) => strongProviderIds.includes(providerId))
    ) {
      return false;
    }

    return (
      createdFromProviderId === AUTH_CONFIG.providers.anonymous ||
      providerIds.length === 0 ||
      providerIds.every(
        (providerId) => providerId === AUTH_CONFIG.providers.anonymous,
      )
    );
  }
}
