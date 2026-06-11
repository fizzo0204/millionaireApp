import { Injectable } from '@angular/core';
import {
  AuthCredential,
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
} from 'firebase/firestore';
import { firebaseAuth } from 'src/app/config/firebase.config';
import { AUTH_CONFIG } from 'src/app/config/auth.config';
import { AppAuthProviderId, UserAuthProfile } from 'src/app/models/auth.model';
import { UserProfileMigrationSnapshot } from 'src/app/models/user-stats.model';
import { environment } from 'src/environments/environment';
import { UserStatsService } from './user-stats.service';
import { AccountLinkService } from './account-link.service';

export interface ExistingProviderProfileState {
  uid: string;
  profileExists: boolean;
  hasSavedProgress: boolean;
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

    try {
      const existingUser = await signInWithCredential(tempAuth, credential);
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

      return {
        uid: existingUser.user.uid,
        profileExists: profileSnapshot.exists(),
        hasSavedProgress:
          profileSnapshot.exists() &&
          this.userStatsService.hasMeaningfulSavedProgress(
            profileSnapshot.data(),
            hasSubcollectionData,
          ),
      };
    } catch (error) {
      console.warn(
        'Non riesco a verificare i progressi del provider esistente',
        error,
      );
      return null;
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
  ): Promise<boolean> {
    const decision =
      await this.accountLinkService.confirmExistingAccountSwitch(providerId);

    return decision === 'use-existing-profile';
  }

  // Prova a eliminare il profilo ospite prima del cambio account, quando l'utente è ancora owner.
  async deleteProfileSnapshotIfAnonymousBeforeAccountSwitch(
    profileSnapshot: UserProfileMigrationSnapshot | null,
  ): Promise<boolean> {
    if (!profileSnapshot) return false;
    if (!this.isAnonymousOnlySnapshot(profileSnapshot)) return false;
    if (firebaseAuth.currentUser?.uid !== profileSnapshot.uid) return false;

    try {
      await this.userStatsService.deleteUserProfileData(profileSnapshot.uid);
      return true;
    } catch (error) {
      console.warn(
        'Profilo ospite non eliminato prima del cambio account:',
        error,
      );
      return false;
    }
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
