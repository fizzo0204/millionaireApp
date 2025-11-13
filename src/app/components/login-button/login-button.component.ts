import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Observable, firstValueFrom } from 'rxjs';
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
  user$: Observable<User | null> = this.auth.user$;
  loading$ = this.auth.isLoading$;

  constructor(private auth: AuthService) {}

  async handleClick(user: User | null) {
    const loading = await firstValueFrom(this.loading$);
    if (loading) return;

    if (!user || user.isAnonymous) {
      return this.auth.googleSignIn();
    }
    return this.auth.logout();
  }
}
