import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AppUpdateService } from 'src/app/services/app-update.service';

@Component({
  selector: 'app-force-update-overlay',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './force-update-overlay.component.html',
  styleUrls: ['./force-update-overlay.component.scss'],
})
export class ForceUpdateOverlayComponent {
  readonly updateRequired$ = this.appUpdateService.updateRequired$;

  constructor(private appUpdateService: AppUpdateService) {}

  openStore(): void {
    this.appUpdateService.openStoreListing();
  }
}
