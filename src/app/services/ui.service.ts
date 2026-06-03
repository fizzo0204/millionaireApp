import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UiService {
  hideBottomNavForModal = signal(false);
  hideBottomNavForSubpage = signal(false);

  openModalOverlay() {
    this.hideBottomNavForModal.set(true);
  }

  closeModalOverlay() {
    this.hideBottomNavForModal.set(false);
  }

  hideBottomNavForInnerPage() {
    this.hideBottomNavForSubpage.set(true);
  }

  showBottomNavForInnerPage() {
    this.hideBottomNavForSubpage.set(false);
  }
}
