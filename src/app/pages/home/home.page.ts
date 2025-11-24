import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { LoginButtonComponent } from '../../components/login-button/login-button.component';
import { AnonymousModalComponent } from '../../components/anonymous-modal/anonymous-modal.component';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    LoginButtonComponent,
    AnonymousModalComponent,
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  private userSub?: Subscription;

  // controlla la visibilità della modale
  showAnonModal = false;
  // per non riaprirla in continuo durante la stessa sessione
  private dismissedOnceInSession = false;

  constructor(private auth: AuthService) {}

  ngOnInit() {
    this.userSub = this.auth.user$.subscribe((user) => {
      if (!user) return;

      if (user.isAnonymous) {
        // utente anonimo → mostra modale solo se non è stata chiusa in questa sessione
        if (!this.dismissedOnceInSession) {
          this.showAnonModal = true;
        }
      } else {
        // utente Google → nessuna modale
        this.showAnonModal = false;
      }
    });
  }

  onAnonModalDismissed() {
    this.showAnonModal = false;
    this.dismissedOnceInSession = true;
  }

  selectLevel(level: string) {
    console.log(`🎮 Hai selezionato il livello: ${level}`);
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }
}
