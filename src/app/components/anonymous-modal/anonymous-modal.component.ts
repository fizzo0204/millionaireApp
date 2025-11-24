import { Component, EventEmitter, Output } from '@angular/core';
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
  @Output() dismissed = new EventEmitter<void>();

  constructor(private auth: AuthService) {}

  close() {
    // chiude solo la modale, l’utente resta anonimo
    this.dismissed.emit();
  }

  async login() {
    await this.auth.googleSignIn();
    this.dismissed.emit();
  }
}
