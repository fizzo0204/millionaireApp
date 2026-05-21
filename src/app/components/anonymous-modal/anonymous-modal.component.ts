import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
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

  constructor(
    private auth: AuthService,
    private modalCtrl: ModalController,
  ) {}

  // Collega il profilo ospite a Google; se riesce, la modale si chiude.
  async googleLogin() {
    if (this.loading) return;

    this.loading = true;

    try {
      const success = await this.auth.googleSignIn();

      if (success) {
        await this.close();
      }
    } catch {
      alert('Login non completato o annullato.');
    } finally {
      this.loading = false;
    }
  }

  // Collega il profilo ospite a Facebook; se riesce, la modale si chiude.
  async facebookLogin() {
    if (this.loading) return;

    this.loading = true;
    try {
      const success = await this.auth.facebookSignIn();

      if (success) {
        await this.close();
      }
    } catch {
      alert('Login Facebook non completato o annullato.');
    } finally {
      this.loading = false;
    }
  }

  // Non cambia account: l'utente resta ospite e continua a giocare.
  async continueAsGuest() {
    if (this.loading) return;

    await this.close();
  }

  // Chiude la modale Ionic corrente.
  private async close() {
    await this.modalCtrl.dismiss();
  }
}
