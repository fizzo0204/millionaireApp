import { Injectable } from '@angular/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

@Injectable({
  providedIn: 'root',
})
export class HapticsService {
  async light() {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  async success() {
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch {}
  }

  async error() {
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }

  async heavy() {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {}
  }
}
