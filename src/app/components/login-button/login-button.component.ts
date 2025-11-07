import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Observable } from 'rxjs';
import { User } from 'firebase/auth';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-button',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './login-button.component.html',
  styleUrls: ['./login-button.component.scss'],
})
export class LoginButtonComponent {
  user$: Observable<User | null>;

  constructor(private authService: AuthService) {
    this.user$ = this.authService.user$;
  }

  login() {
    this.authService.googleSignIn().catch(console.error);
  }

  logout() {
    this.authService.logout().catch(console.error);
  }
}
