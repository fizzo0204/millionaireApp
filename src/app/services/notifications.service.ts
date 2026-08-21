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
  smallIcon: string;
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
    this.listenToLivesChanges();
  }

  /*
   * Schedulare la notifica "vite piene" solo quando l'app va in background
   * e' troppo rischioso su alcuni device (es. Motorola): il processo puo'
   * essere ucciso dal sistema pochi istanti dopo il backgrounding, prima che
   * la catena async verso il plugin nativo faccia in tempo a completarsi.
   * Per questo la ri-schedoliamo anche qui, in modo proattivo, ogni volta
   * che il numero di vite cambia (persa una vita, vita recuperata) mentre
   * l'app e' ancora sicuramente in primo piano.
   */
  private listenToLivesChanges() {
    this.livesService.lives$.subscribe(() => {
      void this.scheduleAll();
    });
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

  private scheduleQueue: Promise<void> = Promise.resolve();

  /*
   * Richiamato spesso e da piu' punti (ogni emissione di lives$, claim del
   * daily reward): se due chiamate si sovrappongono, le rispettive
   * LocalNotifications.schedule() (bridge nativo asincrono) possono risolvere
   * fuori ordine, lasciando schedulata la notifica della chiamata piu'
   * vecchia con un orario ormai stantio invece di quella piu' recente. Bug
   * reale trovato il 2026-08-20. Le chiamate ora vengono messe in coda ed
   * eseguite una alla volta, nell'ordine di invocazione: ognuna rilegge lo
   * stato corrente solo quando tocca davvero a lei, quindi l'ultima in coda
   * vince sempre con i dati piu' freschi.
   */
  async scheduleAll(): Promise<void> {
    this.scheduleQueue = this.scheduleQueue
      .catch(() => {
        // Un errore nella chiamata precedente non deve bloccare le successive.
      })
      .then(() => this.scheduleAllNow());

    return this.scheduleQueue;
  }

  private async scheduleAllNow(): Promise<void> {
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
      this.clearStoredDailyRewardFallback();
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
        : this.getOrCreateFallbackReminderTime(now);

    await this.scheduleNotification(
      NOTIFICATIONS_CONFIG.ids.dailyReward,
      NOTIFICATIONS_CONFIG.copy.dailyReward,
      at,
    );
  }

  /*
   * scheduleAll() e' richiamato molte volte in una sessione (ogni emissione
   * di lives$): se ricalcolassimo "adesso + fallbackDelayMinutes" ad ogni
   * chiamata, l'orario di consegna slitterebbe sempre piu' avanti ogni volta
   * che cambia il numero di vite dopo le dailyReminderHour, arrivando molto
   * piu' tardi del previsto (o mai, in una sera abbastanza attiva). Bug
   * reale trovato durante un audit pre-pubblicazione. Fissiamo quindi il
   * fallback la prima volta che serve in giornata e lo riusiamo per le
   * chiamate successive, finche' non e' gia' passato o non cambia il giorno.
   */
  private getOrCreateFallbackReminderTime(now: Date): Date {
    const todayKey = this.getTodayKey(now);
    const stored = this.readStoredDailyRewardFallback();

    if (stored && stored.dateKey === todayKey && stored.at > now.getTime()) {
      return new Date(stored.at);
    }

    const at = new Date(
      now.getTime() + NOTIFICATIONS_CONFIG.fallbackDelayMinutes * 60 * 1000,
    );

    localStorage.setItem(
      STORAGE_KEYS.dailyRewardNotificationFallback,
      JSON.stringify({ dateKey: todayKey, at: at.getTime() }),
    );

    return at;
  }

  private readStoredDailyRewardFallback(): {
    dateKey: string;
    at: number;
  } | null {
    const raw = localStorage.getItem(
      STORAGE_KEYS.dailyRewardNotificationFallback,
    );

    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);

      if (
        typeof parsed?.dateKey === 'string' &&
        typeof parsed?.at === 'number'
      ) {
        return parsed;
      }
    } catch {
      // Valore corrotto/vecchio formato: ignoralo, ne calcoliamo uno nuovo.
    }

    return null;
  }

  private clearStoredDailyRewardFallback(): void {
    localStorage.removeItem(STORAGE_KEYS.dailyRewardNotificationFallback);
  }

  private getTodayKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
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
          smallIcon: copy.smallIcon,
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
