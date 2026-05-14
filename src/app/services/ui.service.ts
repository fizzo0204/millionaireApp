import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UiService {
  hideBottomNavForModal = signal(false);

  openModalOverlay() {
    this.hideBottomNavForModal.set(true);
  }

  closeModalOverlay() {
    this.hideBottomNavForModal.set(false);
  }
}
