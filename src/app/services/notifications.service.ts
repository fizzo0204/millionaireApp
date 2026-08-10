import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Router } from '@angular/router';
import { LivesService } from './lives';
import { DailyRewardService } from './daily-reward.service';
import { NOTIFICATIONS_CONFIG } from 'src/app/config/notifications.config';
import { STORAGE_KEYS } from 'src/app/config/storage-keys.config';

interface NotificationCopy {
  title: string;
  body: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  constructor(
    private livesService: LivesService,
    private dailyRewardService: DailyRewardService,
    private router: Router,
  ) {
    this.registerTapHandler();
    void this.ensureChannel();
  }

  // Al tap su una qualsiasi delle nostre notifiche (anche ad app chiusa),
  // portiamo sempre l'utente in home.
  private registerTapHandler() {
    if (!Capacitor.isNativePlatform()) return;

    void LocalNotifications.addListener('localNotificationActionPerformed', () => {
      void this.router.navigateByUrl('/home');
    });
  }

  // Il canale "default" creato automaticamente dal plugin ha importanza
  // Default (silenziosa, nessun popup) e su Android non e' piu' modificabile
  // una volta creato. Creiamo quindi un nostro canale con importanza Alta;
  // createChannel() e' idempotente, si puo' richiamare ad ogni avvio.
  private async ensureChannel(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    await LocalNotifications.createChannel({
      id: NOTIFICATIONS_CONFIG.channelId,
      name: NOTIFICATIONS_CONFIG.channelName,
      importance: 4, // IMPORTANCE_HIGH: popup + suono, non solo cassetto silenzioso
      visibility: 1, // VISIBILITY_PUBLIC: visibile anche su lockscreen
    });
  }

  isEnabled(): boolean {
    return localStorage.getItem(STORAGE_KEYS.notificationsEnabled) !== 'false';
  }

  setEnabled(enabled: boolean) {
    localStorage.setItem(STORAGE_KEYS.notificationsEnabled, String(enabled));
  }

  async requestPermissionIfNeeded(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (localStorage.getItem(STORAGE_KEYS.notificationsPermissionAsked)) return;

    const status = await LocalNotifications.checkPermissions();

    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
      await LocalNotifications.requestPermissions();
    }

    localStorage.setItem(STORAGE_KEYS.notificationsPermissionAsked, 'true');
  }

  async scheduleAll(): Promise<void> {
    if (!(await this.canDeliver())) {
      await this.cancelAll();
      return;
    }

    await Promise.all([
      this.scheduleLivesFullNotification(),
      this.scheduleDailyRewardNotification(),
    ]);
  }

  async cancelAll(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    await this.cancelNotification(NOTIFICATIONS_CONFIG.ids.livesFull);
    await this.cancelNotification(NOTIFICATIONS_CONFIG.ids.dailyReward);
  }

  // Notifica di prova per il pulsante di debug: stesso toggle app del flusso
  // reale, ma il permesso viene richiesto qui al volo (invece di dipendere dal
  // primo claim del daily reward) cosi' si puo' testare anche senza aver
  // ancora giocato. Ritardo fisso invece che calcolato dallo stato reale, e id
  // dedicati (vedi notifications.config.ts) cosi' scheduleAll()/cancelAll()
  // del flusso reale non toccano mai le notifiche di test.
  async debugTestLivesFullNotification(): Promise<boolean> {
    if (!(await this.ensureDebugPermission())) return false;

    await this.scheduleNotification(
      NOTIFICATIONS_CONFIG.ids.debugLivesFull,
      NOTIFICATIONS_CONFIG.copy.livesFull,
      this.debugDelayDate(),
    );

    return true;
  }

  async debugTestDailyRewardNotification(): Promise<boolean> {
    if (!(await this.ensureDebugPermission())) return false;

    await this.scheduleNotification(
      NOTIFICATIONS_CONFIG.ids.debugDailyReward,
      NOTIFICATIONS_CONFIG.copy.dailyReward,
      this.debugDelayDate(),
    );

    return true;
  }

  private debugDelayDate(): Date {
    return new Date(Date.now() + NOTIFICATIONS_CONFIG.debugDelaySeconds * 1000);
  }

  private async ensureDebugPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || !this.isEnabled()) return false;

    let status = await LocalNotifications.checkPermissions();

    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
      status = await LocalNotifications.requestPermissions();
    }

    return status.display === 'granted';
  }

  // Vero solo se le notifiche possono davvero essere consegnate: piattaforma nativa,
  // toggle app attivo e permesso di sistema gia' concesso.
  private async canDeliver(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || !this.isEnabled()) return false;

    const status = await LocalNotifications.checkPermissions();

    return status.display === 'granted';
  }

  private async scheduleLivesFullNotification(): Promise<void> {
    const fullAt = this.livesService.getFullRecoveryDate();

    if (!fullAt) {
      await this.cancelNotification(NOTIFICATIONS_CONFIG.ids.livesFull);
      return;
    }

    await this.scheduleNotification(
      NOTIFICATIONS_CONFIG.ids.livesFull,
      NOTIFICATIONS_CONFIG.copy.livesFull,
      fullAt,
    );
  }

  private async scheduleDailyRewardNotification(): Promise<void> {
    if (this.dailyRewardService.getState().claimedToday) {
      await this.cancelNotification(NOTIFICATIONS_CONFIG.ids.dailyReward);
      return;
    }

    const now = new Date();
    const todayAtReminderHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      NOTIFICATIONS_CONFIG.dailyReminderHour,
      0,
      0,
      0,
    );

    const at =
      todayAtReminderHour > now
        ? todayAtReminderHour
        : new Date(
            now.getTime() +
              NOTIFICATIONS_CONFIG.fallbackDelayMinutes * 60 * 1000,
          );

    await this.scheduleNotification(
      NOTIFICATIONS_CONFIG.ids.dailyReward,
      NOTIFICATIONS_CONFIG.copy.dailyReward,
      at,
    );
  }

  private async scheduleNotification(
    id: number,
    copy: NotificationCopy,
    at: Date,
  ): Promise<void> {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: copy.title,
          body: copy.body,
          channelId: NOTIFICATIONS_CONFIG.channelId,
          // allowWhileIdle: consegna la notifica anche in Doze (schermo spento
          // a lungo), non solo quando il telefono e' attivo/sbloccato.
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
  }

  private async cancelNotification(id: number): Promise<void> {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  }
}
