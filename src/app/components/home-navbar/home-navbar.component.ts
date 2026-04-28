import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LoginButtonComponent } from '../login-button/login-button.component';

@Component({
  selector: 'app-home-navbar',
  standalone: true,
  imports: [CommonModule, LoginButtonComponent],
  templateUrl: './home-navbar.component.html',
  styleUrls: ['./home-navbar.component.scss'],
})
export class HomeNavbarComponent {}
