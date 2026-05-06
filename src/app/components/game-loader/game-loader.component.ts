import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-game-loader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-loader.component.html',
  styleUrls: ['./game-loader.component.scss'],
})
export class GameLoaderComponent {
  @Input() title = 'Preparazione quiz...';

  @Input() subtitle = 'Stiamo caricando le domande migliori per te';

  @Input() icon = '👑';
}
