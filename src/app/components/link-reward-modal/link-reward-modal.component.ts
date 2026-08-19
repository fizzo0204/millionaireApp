import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';

/*
 * Id esplicito richiesto da ModalController.dismiss(): questa modale puo'
 * essere presentata mentre la anonymous-modal e' ancora aperta sotto di lei
 * (vedi AuthService.showLinkRewardToast). Senza un id, dismiss() chiude
 * sempre la modale in cima allo stack Ionic, non necessariamente questa.
 */
export const LINK_REWARD_MODAL_ID = 'link-reward-modal';

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
