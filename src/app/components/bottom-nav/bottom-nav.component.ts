import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { NavigationTab } from 'src/app/models/navigation.model';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.scss'],
})
export class BottomNavComponent {
  @Input() activeTab: NavigationTab = 'home';
  @Output() tabChange = new EventEmitter<NavigationTab>();

  constructor(private router: Router) {}

  setActiveTab(tab: NavigationTab) {
    if (tab === this.activeTab) {
      const cleanUrl = this.router.url.split('?')[0];

      if (tab !== 'eventi' || cleanUrl === '/events') return;
    }

    const page = document.querySelector('.page-fade');
    page?.classList.add('page-fade-out');

    setTimeout(async () => {
      this.tabChange.emit(tab);

      if (tab === 'home') {
        await this.router.navigateByUrl('/home');
      }

      if (tab === 'negozio') {
        await this.router.navigateByUrl('/shop');
      }

      if (tab === 'eventi') {
        await this.router.navigateByUrl('/events');
      }

      if (tab === 'profilo') {
        await this.router.navigateByUrl('/profile');
      }

      if (tab === 'impostazioni') {
        await this.router.navigateByUrl('/settings');
      }

      document.querySelectorAll('.page-fade-out').forEach((el) => {
        el.classList.remove('page-fade-out');
      });
    }, 160);
  }
}
