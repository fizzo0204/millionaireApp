import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
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
    const avatar = await this.getAvatarData(uid);

    if (avatar.unlockedAvatarIds.includes(avatarId)) {
      return;
    }

    await this.updateAvatarData(uid, {
      unlockedAvatarIds: [...avatar.unlockedAvatarIds, avatarId],
    });
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
