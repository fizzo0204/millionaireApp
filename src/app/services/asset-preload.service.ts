import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AssetPreloadService {
  private started = false;

  private readonly priorityImages = [
    'assets/ui/coin-turtle.webp',
    'assets/ui/turtle-chest.webp',
    'assets/ui/epic-chest-reward.webp',
    'assets/ui/lvlUp.webp',
    'assets/ui/logo-access.webp',
    'assets/images/navbarLogo.webp',
    'assets/mascotte/mascotte.webp',
  ];

  preloadPriorityImages() {
    if (this.started) return;

    this.started = true;

    /*
     * Precarichiamo solo immagini ricorrenti e leggere da tenere pronte
     * per modali, navbar e premi. Non tocchiamo l'audio: resta gestito dal
     * servizio audio, cosi non cambiamo il comportamento attuale.
     */
    this.runWhenIdle(() => {
      for (const src of this.priorityImages) {
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
      }
    });
  }

  private runWhenIdle(callback: () => void) {
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
    };

    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(callback, { timeout: 1200 });
      return;
    }

    setTimeout(callback, 350);
  }
}
