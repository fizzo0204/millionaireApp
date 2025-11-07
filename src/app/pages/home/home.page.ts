import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LoginButtonComponent } from '../../components/login-button/login-button.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, LoginButtonComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HomePage {
  constructor(private router: Router) {
    console.log('🏠 HomePage inizializzata!');
  }

  /**
   * Seleziona un livello di difficoltà.
   * Al momento effettua solo un log, ma qui potrai avviare il quiz
   * o navigare verso la pagina corrispondente (es. /quiz?level=hard)
   */
  selectLevel(level: string) {
    console.log(`🎮 Hai selezionato il livello: ${level}`);

    // Esempio di navigazione futura:
    // this.router.navigate(['/quiz'], { queryParams: { level } });
  }
}
