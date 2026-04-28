import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { User } from 'firebase/auth';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  user$: Observable<User | null> = this.authService.user$;

  constructor(private authService: AuthService) {}

  login() {
    this.authService.googleSignIn().catch(console.error);
  }

  logout() {
    this.authService.logout().catch(console.error);
  }
}
