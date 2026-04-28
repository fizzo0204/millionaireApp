import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-anonymous-modal',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './anonymous-modal.component.html',
  styleUrls: ['./anonymous-modal.component.scss'],
})
export class AnonymousModalComponent {
  loading = false;

  constructor(private auth: AuthService) {}

  async login() {
    if (this.loading) return;

    this.loading = true;

    try {
      await this.auth.googleSignIn();
    } catch {
      console.log('Login non completato o annullato.');
    } finally {
      this.loading = false;
    }
  }
}
