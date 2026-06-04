import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AchievementToastService } from 'src/app/services/achievement-toast.service';

@Component({
  selector: 'app-achievement-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './achievement-toast.component.html',
  styleUrls: ['./achievement-toast.component.scss'],
})
export class AchievementToastComponent {
  readonly toast$ = this.achievementToast.currentToast$;

  constructor(private achievementToast: AchievementToastService) {}
}
