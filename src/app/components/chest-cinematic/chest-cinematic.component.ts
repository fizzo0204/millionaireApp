import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type ChestCinematicPhase = 'opening' | 'flash' | 'reward';
export type ChestCinematicRevealType = 'coins' | 'xp' | 'avatar' | 'chest';

@Component({
  selector: 'app-chest-cinematic',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chest-cinematic.component.html',
  styleUrls: ['./chest-cinematic.component.scss'],
})
export class ChestCinematicComponent {
  @Input() visible = false;
  @Input() phase: ChestCinematicPhase = 'opening';

  @Input() chestImage = '';
  @Input() chestAlt = 'Chest';
  @Input() epic = false;

  @Input() revealType: ChestCinematicRevealType = 'coins';
  @Input() rewardIcon = '';
  @Input() rewardLabel = '';

  @Input() canDoubleReward = false;
  @Input() doubleRewardLoading = false;

  @Output() continueRequested = new EventEmitter<boolean>();
  @Output() doubleRequested = new EventEmitter<Event>();

  onContinue(force = false) {
    this.continueRequested.emit(force);
  }

  onDouble(event: Event) {
    event.stopPropagation();
    this.doubleRequested.emit(event);
  }
}
