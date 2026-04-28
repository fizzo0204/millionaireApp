import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [IonicModule],
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.scss'],
})
export class BottomNavComponent {
  @Input() activeTab: string = 'home';
  @Output() tabChange = new EventEmitter<string>();

  constructor(private router: Router) {}

  setActiveTab(tab: string) {
    if (tab === this.activeTab) return;

    const page = document.querySelector('.page-fade');
    page?.classList.add('page-fade-out');

    setTimeout(async () => {
      this.tabChange.emit(tab);

      if (tab === 'home') {
        await this.router.navigateByUrl('/home');
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
