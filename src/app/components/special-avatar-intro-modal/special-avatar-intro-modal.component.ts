import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-special-avatar-intro-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './special-avatar-intro-modal.component.html',
  styleUrls: ['./special-avatar-intro-modal.component.scss'],
})
export class SpecialAvatarIntroModalComponent implements OnChanges, OnDestroy {
  @Input() title = '';
  @Input() message = '';
  @Input() avatarLabel = 'Avatar speciale';
  @Input() avatarImageSrc: string | null = null;

  @Output() closed = new EventEmitter<void>();

  visibleMessage = '';
  completed = false;
  showReward = false;

  private chunks: string[] = [];
  private chunkIndex = 0;
  private timer?: ReturnType<typeof setInterval>;
  private rewardTimer?: ReturnType<typeof setTimeout>;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['message']) {
      this.startMessageReveal();
    }
  }

  ngOnDestroy() {
    this.clearTimer();
    this.clearRewardTimer();
  }

  handlePrimaryAction() {
    if (!this.completed) {
      this.finishMessageReveal();
      return;
    }

    if (!this.showReward) {
      this.revealReward();
      return;
    }

    this.closed.emit();
  }

  private startMessageReveal() {
    this.clearTimer();
    this.clearRewardTimer();
    this.visibleMessage = '';
    this.completed = false;
    this.showReward = false;
    this.chunks = this.message.match(/\S+\s*/g) ?? [this.message];
    this.chunkIndex = 0;

    this.timer = setInterval(() => {
      this.visibleMessage += this.chunks[this.chunkIndex] ?? '';
      this.chunkIndex += 1;

      if (this.chunkIndex >= this.chunks.length) {
        this.clearTimer();
        this.completed = true;
        this.scheduleRewardReveal();
      }
    }, 165);
  }

  private finishMessageReveal() {
    this.clearTimer();
    this.clearRewardTimer();
    this.visibleMessage = this.chunks.join('');
    this.chunkIndex = this.chunks.length;
    this.completed = true;
    this.scheduleRewardReveal();
  }

  private clearTimer() {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = undefined;
  }

  private scheduleRewardReveal() {
    this.clearRewardTimer();

    this.rewardTimer = setTimeout(() => {
      this.revealReward();
    }, 1800);
  }

  private revealReward() {
    this.clearRewardTimer();
    this.showReward = true;
  }

  private clearRewardTimer() {
    if (!this.rewardTimer) return;

    clearTimeout(this.rewardTimer);
    this.rewardTimer = undefined;
  }
}
