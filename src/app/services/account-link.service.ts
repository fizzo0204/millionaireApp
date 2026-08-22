import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { AccountConflictModalComponent } from 'src/app/components/account-conflict-modal/account-conflict-modal.component';
import { AUTH_PROVIDERS } from 'src/app/data/auth-providers.data';
import { ACCOUNT_CONFLICT_MODAL_ID } from 'src/app/config/modal-ids.config';
import {
  AccountConflictComparison,
  AccountConflictDecision,
  AppAuthProviderId,
} from 'src/app/models/auth.model';

@Injectable({
  providedIn: 'root',
})
export class AccountLinkService {
  constructor(private modalCtrl: ModalController) {}

  async confirmExistingAccountSwitch(
    providerId: AppAuthProviderId,
    comparison: AccountConflictComparison,
  ): Promise<AccountConflictDecision> {
    const providerLabel = AUTH_PROVIDERS[providerId]?.label ?? 'questo account';

    const modal = await this.modalCtrl.create({
      id: ACCOUNT_CONFLICT_MODAL_ID,
      component: AccountConflictModalComponent,
      componentProps: {
        providerLabel,
        currentCoins: comparison.currentCoins,
        currentXp: comparison.currentXp,
        existingCoins: comparison.existingCoins,
        existingXp: comparison.existingXp,
      },
      cssClass: 'account-conflict-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const result = await modal.onDidDismiss<AccountConflictDecision>();

    return result.data ?? 'keep-current';
  }
}
