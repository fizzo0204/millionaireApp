import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { LINK_REWARD_MODAL_ID } from 'src/app/config/modal-ids.config';

@Component({
  selector: 'app-link-reward-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './link-reward-modal.component.html',
  styleUrls: ['./link-reward-modal.component.scss'],
})
export class LinkRewardModalComponent {
  @Input() coins = 0;
  @Input() xp = 0;

  readonly coinIconPath = 'assets/ui/coin-turtle.webp';

  constructor(private modalCtrl: ModalController) {}

  async close(): Promise<void> {
    await this.modalCtrl.dismiss(undefined, undefined, LINK_REWARD_MODAL_ID);
  }
}
