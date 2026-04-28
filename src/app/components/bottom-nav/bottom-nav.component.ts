import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.scss'],
})
export class BottomNavComponent {
  @Input() activeTab: string = 'home';
  @Output() tabChange = new EventEmitter<string>();

  constructor(private router: Router) {}

  setActiveTab(tab: string) {
    this.tabChange.emit(tab);

    // 👉 navigazione
    if (tab === 'home') this.router.navigateByUrl('/home');
    if (tab === 'impostazioni') this.router.navigateByUrl('/settings');
  }
}
