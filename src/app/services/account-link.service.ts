import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { AccountConflictModalComponent } from 'src/app/components/account-conflict-modal/account-conflict-modal.component';
import { AUTH_PROVIDERS } from 'src/app/data/auth-providers.data';
import {
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
  ): Promise<AccountConflictDecision> {
    const providerLabel = AUTH_PROVIDERS[providerId]?.label ?? 'questo account';

    const modal = await this.modalCtrl.create({
      component: AccountConflictModalComponent,
      componentProps: {
        providerLabel,
      },
      cssClass: 'account-conflict-ion-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const result = await modal.onDidDismiss<AccountConflictDecision>();

    return result.data ?? 'keep-current';
  }
}
