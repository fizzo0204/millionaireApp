import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { LogoutDecision } from 'src/app/models/logout.model';
import { LOGOUT_CONFIRM_MODAL_ID } from 'src/app/config/modal-ids.config';

@Component({
  selector: 'app-logout-confirm-modal',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './logout-confirm-modal.component.html',
  styleUrls: ['./logout-confirm-modal.component.scss'],
})
export class LogoutConfirmModalComponent {
  constructor(private modalCtrl: ModalController) {}

  keepPlaying() {
    this.close('cancel');
  }

  confirmLogout() {
    this.close('logout');
  }

  private close(decision: LogoutDecision) {
    this.modalCtrl.dismiss(decision, undefined, LOGOUT_CONFIRM_MODAL_ID);
  }
}
