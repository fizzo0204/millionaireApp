import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  arrayUnion,
  doc,
  getDoc,
  updateDoc,
  UpdateData,
  DocumentData,
} from '@angular/fire/firestore';

import { UserAvatarData } from 'src/app/models/user-stats.model';

@Injectable({
  providedIn: 'root',
})
export class UserAvatarDataService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  readonly defaultAvatar: UserAvatarData = {
    selectedAvatar: 'letter',
    unlockedAvatarIds: [],
  };

  async getAvatarData(uid: string): Promise<UserAvatarData> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await this.runFirestore(async () => {
      return getDoc(userRef);
    });

    if (!snapshot.exists()) {
      return this.defaultAvatar;
    }

    const data = snapshot.data();

    const avatar: UserAvatarData = {
      selectedAvatar:
        data['avatar']?.selectedAvatar ??
        data['selectedAvatar'] ??
        data['dailyReward']?.selectedAvatar ??
        'letter',
      unlockedAvatarIds:
        data['avatar']?.unlockedAvatarIds ??
        data['unlockedAvatarIds'] ??
        data['dailyReward']?.unlockedAvatarIds ??
        [],
    };

    if (!data['avatar']) {
      await this.runFirestore(() =>
        updateDoc(userRef, {
          avatar,
        }),
      );
    }

    return avatar;
  }

  async unlockDailyAvatar(uid: string, avatarId: string): Promise<void> {
    await this.addUnlockedAvatarId(uid, avatarId);
  }

  /*
   * Aggiunge un avatar alla lista sbloccati con arrayUnion, atomico lato
   * Firestore: a differenza di un leggi-poi-scrivi, due sblocchi avatar
   * concorrenti (es. acquisto forziere e daily reward nello stesso istante)
   * non si sovrascrivono piu' a vicenda.
   */
  async addUnlockedAvatarId(uid: string, avatarId: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      updateDoc(userRef, {
        'avatar.unlockedAvatarIds': arrayUnion(avatarId),
      }),
    );
  }

  async saveSelectedAvatar(uid: string, avatarId: string): Promise<void> {
    await this.updateAvatarData(uid, {
      selectedAvatar: avatarId,
    });
  }

  async updateAvatarData(
    uid: string,
    data: Partial<UserAvatarData>,
  ): Promise<void> {
    const updatePayload: UpdateData<DocumentData> = {};

    for (const [key, value] of Object.entries(data)) {
      updatePayload[`avatar.${key}`] = value;
    }

    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() => updateDoc(userRef, updatePayload));
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
