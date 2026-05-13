import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-game-loader',
  standalone: true,
  templateUrl: './game-loader.component.html',
  styleUrls: ['./game-loader.component.scss'],
})
export class GameLoaderComponent {
  @Input() title = 'Preparazione quiz...';

  @Input() subtitle = 'Stiamo caricando le domande migliori per te';
}
