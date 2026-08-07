import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { AccountDeletionDecision } from 'src/app/models/account-deletion.model';

@Component({
  selector: 'app-delete-account-confirm-modal',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './delete-account-confirm-modal.component.html',
  styleUrls: ['./delete-account-confirm-modal.component.scss'],
})
export class DeleteAccountConfirmModalComponent {
  constructor(private modalCtrl: ModalController) {}

  cancel() {
    this.close('cancel');
  }

  confirmDelete() {
    this.close('delete');
  }

  private close(decision: AccountDeletionDecision) {
    this.modalCtrl.dismiss(decision);
  }
}
