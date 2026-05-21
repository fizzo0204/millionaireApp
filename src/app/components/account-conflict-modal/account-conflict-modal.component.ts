import { Component, Input } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { AccountConflictDecision } from 'src/app/models/auth.model';

@Component({
  selector: 'app-account-conflict-modal',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './account-conflict-modal.component.html',
  styleUrls: ['./account-conflict-modal.component.scss'],
})
export class AccountConflictModalComponent {
  @Input() providerLabel = 'questo account';

  constructor(private modalCtrl: ModalController) {}

  keepCurrentProfile() {
    this.close('keep-current');
  }

  useExistingProfile() {
    this.close('use-existing-profile');
  }

  private close(decision: AccountConflictDecision) {
    this.modalCtrl.dismiss(decision);
  }
}
