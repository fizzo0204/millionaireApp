import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { LoginButtonComponent } from '../../components/login-button/login-button.component';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, LoginButtonComponent],
})
export class HomePage implements OnInit, OnDestroy {
  private userSub?: Subscription;

  constructor(private auth: AuthService) {}

  ngOnInit() {
    // 🔹 Se in futuro vorrai riattivare notifiche / toast, puoi usare questa subscription
    this.userSub = this.auth.user$.subscribe((user) => {
      console.log(
        '👤 Stato utente:',
        user?.isAnonymous ? 'Anonimo' : user?.displayName
      );
    });
  }

  selectLevel(level: string) {
    console.log(`🎮 Hai selezionato il livello: ${level}`);
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }
}
