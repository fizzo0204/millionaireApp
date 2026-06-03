import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class NavigationTransitionService {
  private navigating = false;
  private readonly transitionMs = 160;

  constructor(private router: Router) {}

  async navigateByUrl(url: string): Promise<boolean> {
    if (this.navigating) return false;

    const cleanCurrentUrl = this.router.url.split('?')[0];
    const cleanTargetUrl = url.split('?')[0];

    if (cleanCurrentUrl === cleanTargetUrl) return false;

    this.navigating = true;
    const pages = Array.from(document.querySelectorAll('.page-fade'));

    pages.forEach((page) => page.classList.add('page-fade-out'));

    await this.wait(this.transitionMs);

    try {
      return await this.router.navigateByUrl(url);
    } finally {
      /*
       * Il nuovo componente entra con .page-fade; rimuoviamo eventuali residui
       * dal vecchio DOM se Ionic lo mantiene vivo per qualche frame.
       */
      requestAnimationFrame(() => {
        document.querySelectorAll('.page-fade-out').forEach((page) => {
          page.classList.remove('page-fade-out');
        });

        this.navigating = false;
      });
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
