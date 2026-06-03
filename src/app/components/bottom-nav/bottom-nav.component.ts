import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { NavigationTab } from 'src/app/models/navigation.model';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

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

  constructor(
    private navigation: NavigationTransitionService,
    private router: Router,
  ) {}

  setActiveTab(tab: NavigationTab) {
    if (tab === this.activeTab) {
      const cleanUrl = this.router.url.split('?')[0];

      if (tab !== 'eventi' || cleanUrl === '/events') return;
    }

    this.tabChange.emit(tab);

    const routes: Record<NavigationTab, string> = {
      home: '/home',
      eventi: '/events',
      negozio: '/shop',
      profilo: '/profile',
      impostazioni: '/settings',
    };

    void this.navigation.navigateByUrl(routes[tab]);
  }
}
