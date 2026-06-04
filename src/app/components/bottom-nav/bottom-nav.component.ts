import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { NavigationTab } from 'src/app/models/navigation.model';
import { DailyEventsService } from 'src/app/services/daily-events.service';
import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.scss'],
})
export class BottomNavComponent implements OnInit {
  @Input() activeTab: NavigationTab = 'home';
  @Output() tabChange = new EventEmitter<NavigationTab>();
  dailyNotificationCount$ = this.dailyEventsService.dailyNotificationCount$;

  constructor(
    private dailyEventsService: DailyEventsService,
    private navigation: NavigationTransitionService,
    private router: Router,
  ) {}

  ngOnInit() {
    void this.dailyEventsService.refreshNotificationCount();
  }

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
