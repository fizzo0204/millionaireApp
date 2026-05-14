import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-daily-reward-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-reward-modal.component.html',
  styleUrls: ['./daily-reward-modal.component.scss'],
})
export class DailyRewardModalComponent {
  @Output() closed = new EventEmitter<void>();

  claimed = false;

  claimReward() {
    this.claimed = true;
  }

  claimDoubleReward() {
    this.claimed = true;
  }

  continue() {
    this.closed.emit();
  }
}
