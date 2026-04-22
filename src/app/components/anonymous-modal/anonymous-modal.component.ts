import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-anonymous-modal',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './anonymous-modal.component.html',
  styleUrls: ['./anonymous-modal.component.scss'],
})
export class AnonymousModalComponent {
  loading = false;

  constructor(private auth: AuthService) {}

  async login() {
    if (this.loading) return;

    this.loading = true;
    const success = await this.auth.googleSignIn();
    this.loading = false;

    if (!success) {
      console.log('Login non completato o annullato.');
    }
  }
}
