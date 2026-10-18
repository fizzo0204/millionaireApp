import { Injectable } from '@angular/core';
import {
  AdMob,
  AdmobConsentStatus,
  AdMobBannerSize,
  BannerAdOptions,
  BannerAdPluginEvents,
  BannerAdSize,
  BannerAdPosition,
  RewardAdOptions,
  AdMobRewardItem,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { App } from '@capacitor/app';
import { AudioService } from './audio';
import { ADS_CONFIG } from '../config/ads.config';
import { PluginListenerHandle } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AdsService {
  private rewardedAdCompletedSubject = new Subject<void>();
  private privacyOptionsRequiredSubject = new BehaviorSubject<boolean>(false);
  private bannerVisible = false;
  private bannerWanted = false;
  private bannerOperationId = 0;
  private adMobInitialized = false;
  private initializePromise?: Promise<boolean>;
  private rewardedAdInProgress = false;
  private bannerSizeListenerAdded = false;
  private bannerHeightSubject = new BehaviorSubject<number>(0);

  readonly rewardedAdCompleted$ =
    this.rewardedAdCompletedSubject.asObservable();

  /*
   * Altezza reale del banner ADAPTIVE_BANNER (in dp, coincide con i px CSS
   * nella WebView) riportata dal plugin nativo. Serve per riservare lo
   * spazio esatto in fondo alle pagine senza bottom navbar, invece di
   * indovinare un valore fisso che varia da device a device.
   */
  readonly bannerHeight$ = this.bannerHeightSubject.asObservable();

  // Vero quando AdMob richiede di mostrare un punto d'accesso "gestisci consenso" in UI.
  readonly privacyOptionsRequired$ =
    this.privacyOptionsRequiredSubject.asObservable();

  constructor(private audioService: AudioService) {
    void this.initialize();
  }

  async initialize(): Promise<boolean> {
    if (this.adMobInitialized) return true;

    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.ensureConsent()
      .then((canRequestAds) => {
        if (!canRequestAds) return false;

        return AdMob.initialize().then(() => {
          this.adMobInitialized = true;
          void this.listenBannerSize();
          return true;
        });
      })
      .catch((error) => {
        console.warn('Errore inizializzazione AdMob:', error);
        return false;
      })
      .finally(() => {
        this.initializePromise = undefined;
      });

    return this.initializePromise;
  }

  // Riapre il form di gestione del consenso pubblicitario (es. da Impostazioni).
  async openPrivacyOptionsForm(): Promise<void> {
    try {
      await AdMob.showPrivacyOptionsForm();

      const consentInfo = await AdMob.requestConsentInfo();

      // 'REQUIRED' invece dell'enum PrivacyOptionsRequirementStatus: @capacitor-community/admob@7.2.0
      // dichiara l'enum ma non lo ri-esporta da consent/index.d.ts (bug nei type, non nel runtime).
      this.privacyOptionsRequiredSubject.next(
        consentInfo.privacyOptionsRequirementStatus === 'REQUIRED',
      );
    } catch (error) {
      console.warn('Errore apertura opzioni privacy AdMob:', error);
    }
  }

  /*
   * Flusso di consenso GDPR/UMP: va eseguito prima di AdMob.initialize() e prima
   * di caricare qualsiasi annuncio. Se il consenso e richiesto e il form e
   * disponibile, lo mostra (contenuto configurato in console AdMob). Il valore
   * di ritorno (canRequestAds) e l'unica fonte di verita su cui basarsi per
   * decidere se e lecito richiedere annunci: se resta false (es. consenso
   * richiesto ma form non disponibile, offline) AdMob non viene inizializzato
   * e banner/rewarded restano semplicemente no-op finche non si riprova.
   */
  private async ensureConsent(): Promise<boolean> {
    try {
      let consentInfo = await AdMob.requestConsentInfo();

      if (
        consentInfo.status === AdmobConsentStatus.REQUIRED &&
        consentInfo.isConsentFormAvailable
      ) {
        consentInfo = await AdMob.showConsentForm();
      }

      // 'REQUIRED' invece dell'enum PrivacyOptionsRequirementStatus: @capacitor-community/admob@7.2.0
      // dichiara l'enum ma non lo ri-esporta da consent/index.d.ts (bug nei type, non nel runtime).
      this.privacyOptionsRequiredSubject.next(
        consentInfo.privacyOptionsRequirementStatus === 'REQUIRED',
      );

      return consentInfo.canRequestAds;
    } catch (error) {
      console.warn('Errore consenso AdMob/UMP:', error);
      return false;
    }
  }

  // Registra una sola volta il listener che riporta l'altezza reale del banner.
  private async listenBannerSize(): Promise<void> {
    if (this.bannerSizeListenerAdded) return;

    this.bannerSizeListenerAdded = true;

    await AdMob.addListener(
      BannerAdPluginEvents.SizeChanged,
      (info: AdMobBannerSize) => {
        this.bannerHeightSubject.next(info?.height ?? 0);
      },
    );
  }

  async showBanner() {
    this.bannerWanted = true;
    const operationId = ++this.bannerOperationId;

    if (this.bannerVisible) return;

    const initialized = await this.initialize();

    if (!initialized) return;
    if (!this.bannerWanted || operationId !== this.bannerOperationId) return;

    const options: BannerAdOptions = {
      adId: ADS_CONFIG.banner.adId,
      // ADAPTIVE_BANNER e a larghezza piena: il formato fisso BANNER (320dp) veniva
      // posizionato vicino al bordo sinistro invece che centrato, per un bug nel
      // calcolo dei margini di @capacitor-community/admob quando il contenitore
      // padre non e davvero una CoordinatorLayout (vedi BannerExecutor.java).
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
    };

    try {
      await AdMob.showBanner(options);

      if (!this.bannerWanted || operationId !== this.bannerOperationId) {
        this.bannerVisible = true;
        await this.hideBanner();
        return;
      }

      this.bannerVisible = true;
    } catch (error) {
      if (operationId === this.bannerOperationId) {
        this.bannerVisible = false;
      }

      console.warn('Errore banner AdMob:', error);
    }
  }

  async hideBanner() {
    this.bannerWanted = false;
    const operationId = ++this.bannerOperationId;

    try {
      await AdMob.hideBanner();
    } catch (error) {
      console.warn('Errore hide banner AdMob:', error);
    } finally {
      if (operationId === this.bannerOperationId && !this.bannerWanted) {
        this.bannerVisible = false;
        return;
      }

      /*
       * Se un vecchio hide termina dopo una nuova richiesta show,
       * rimostriamo il banner per rispettare lo stato desiderato.
       */
      if (this.bannerWanted) {
        this.bannerVisible = false;
        void this.showBanner();
      }
    }
  }

  /*
   * Mostra un rewarded video e risolve con true solo se l'utente ha davvero
   * guadagnato il premio. Risolve SEMPRE (mai pending per sempre) e libera
   * sempre il lock rewardedAdInProgress, qualunque cosa accada.
   *
   * Riscritto il 2026-10-18 dopo segnalazioni in produzione ("guardo il video
   * fino alla fine, lo chiudo e non succede niente"). Due bug nella versione
   * precedente:
   * 1. Un timeout fisso di 60s, partito prima ancora del caricamento, chiudeva
   *    il flusso con false mentre l'annuncio era ancora a schermo: gli annunci
   *    reali (video 30s + schermata finale/playable, piu' il caricamento)
   *    superano spesso il minuto, a differenza di quelli di test. Rimossi i
   *    listener e risolto false, il Rewarded/Dismissed successivi andavano persi.
   * 2. AdMob.showRewardVideoAd() lato nativo (@capacitor-community/admob 7.2.0)
   *    risolve SOLO quando il premio viene guadagnato: se l'utente chiudeva il
   *    video prima della fine, o l'annuncio falliva a mostrarsi, quell'await
   *    restava pending per sempre e con lui rewardedAdInProgress (ogni video
   *    successivo diventava un no-op fino al riavvio dell'app).
   */
  async showRewardedAd(countForDailyMission = true): Promise<boolean> {
    if (this.rewardedAdInProgress) return false;

    this.rewardedAdInProgress = true;

    let musicPaused = false;

    try {
      const initialized = await this.initialize();

      if (!initialized) return false;

      await this.audioService.pauseMusic();
      musicPaused = true;

      const result = await this.runRewardedAd();

      /*
       * Fix rewarded video: su alcuni device l'evento della reward arriva
       * mentre la pubblicita e ancora sopra l'app. Aspettiamo quindi che
       * l'app torni davvero attiva prima di far partire ruota, premi o UI.
       */
      await this.waitAppActiveAfterAd();
      await this.wait(350);

      if (result && countForDailyMission) {
        this.rewardedAdCompletedSubject.next();
      }

      return result;
    } catch (err) {
      console.error('❌ Errore rewarded video:', err);
      return false;
    } finally {
      this.rewardedAdInProgress = false;

      if (musicPaused) {
        await this.audioService.playMusic().catch(() => undefined);
      }
    }
  }

  /*
   * Macchina a stati del singolo rewarded video. Fasi:
   * - loading: prepareRewardVideoAd in corso (tetto loadTimeoutMs);
   * - requested: show richiesto, in attesa di Showed (tetto showStartTimeoutMs);
   * - showing: annuncio a schermo, NESSUN limite di durata. Termina con
   *   Dismissed, oppure col watchdog se il Dismissed va perso;
   * - done: risolto, listener/timer rimossi, eventi tardivi ignorati.
   *
   * Il premio e' considerato guadagnato con uno qualunque di due segnali:
   * evento Rewarded, oppure risoluzione di showRewardVideoAd() (che lato
   * nativo risolve proprio con il RewardItem). Non si guarda reward.amount:
   * dipende dalla configurazione dell'unita' in console AdMob, mentre un
   * Rewarded significa comunque che l'utente ha visto l'annuncio per intero.
   */
  private runRewardedAd(): Promise<boolean> {
    const config = ADS_CONFIG.rewarded;

    return new Promise<boolean>((resolve) => {
      let phase: 'loading' | 'requested' | 'showing' | 'done' = 'loading';
      let hasReward = false;
      let dismissed = false;
      let appSeenInactive = false;
      let consecutiveActiveChecks = 0;

      const listeners: PluginListenerHandle[] = [];
      const timers = new Set<ReturnType<typeof setTimeout>>();
      let watchdog: ReturnType<typeof setInterval> | undefined;

      const schedule = (callback: () => void, ms: number) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          callback();
        }, ms);

        timers.add(timer);
        return timer;
      };

      const cancel = (timer: ReturnType<typeof setTimeout>) => {
        clearTimeout(timer);
        timers.delete(timer);
      };

      const finish = (result: boolean) => {
        if (phase === 'done') return;

        phase = 'done';
        timers.forEach((timer) => clearTimeout(timer));
        timers.clear();

        if (watchdog) {
          clearInterval(watchdog);
          watchdog = undefined;
        }

        listeners.splice(0).forEach((handle) => {
          void handle.remove().catch(() => undefined);
        });

        resolve(result);
      };

      // Un listener registrato dopo finish() viene rimosso subito, non resta appeso.
      const track = (handle: PluginListenerHandle) => {
        if (phase === 'done') {
          void handle.remove().catch(() => undefined);
          return;
        }

        listeners.push(handle);
      };

      const markRewarded = () => {
        if (phase === 'done') return;

        hasReward = true;

        // Rewarded arrivato dopo il Dismissed (in attesa nella finestra di grazia).
        if (dismissed) finish(true);
      };

      /*
       * Rete di sicurezza se il Dismissed non arriva mai al JS: con l'annuncio
       * a schermo l'Activity dell'app e' in pausa (App.getState().isActive ===
       * false); se torna attiva in modo stabile l'annuncio e' chiuso. Chiude
       * solo dopo aver visto l'app inattiva almeno una volta, cosi' su un
       * device che riportasse sempre "attiva" non chiude mai per errore mentre
       * il video e' in corso. Un errore di getState conta come "inattiva" per
       * lo stesso motivo.
       */
      const startWatchdog = () => {
        if (watchdog) return;

        watchdog = setInterval(async () => {
          const state = await App.getState().catch(() => ({ isActive: false }));

          if (phase !== 'showing' || dismissed) return;

          if (!state.isActive) {
            appSeenInactive = true;
            consecutiveActiveChecks = 0;
            return;
          }

          if (!appSeenInactive) return;

          consecutiveActiveChecks++;

          if (consecutiveActiveChecks >= config.watchdogActiveChecks) {
            console.warn('Rewarded video: Dismissed non ricevuto, chiusura dal watchdog.');
            finish(hasReward);
          }
        }, config.watchdogIntervalMs);
      };

      const markShowing = () => {
        if (phase !== 'loading' && phase !== 'requested') return;

        phase = 'showing';
        startWatchdog();
      };

      const run = async () => {
        track(
          await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
            markRewarded();
          }),
        );

        track(
          await AdMob.addListener(RewardAdPluginEvents.Showed, () => {
            markShowing();
          }),
        );

        track(
          await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
            if (phase === 'done') return;

            dismissed = true;

            if (hasReward) {
              finish(true);
              return;
            }

            // Alcuni adapter di mediazione consegnano il Rewarded subito dopo il Dismissed.
            schedule(() => finish(hasReward), config.rewardGraceMs);
          }),
        );

        track(
          await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
            console.warn('Rewarded video non mostrato:', error);
            finish(false);
          }),
        );

        track(
          await App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) return;

            appSeenInactive = true;

            // App in pausa per l'annuncio anche se lo Showed e' andato perso.
            if (phase === 'requested') markShowing();
          }),
        );

        if (phase === 'done') return;

        const loadTimer = schedule(() => {
          console.warn('Rewarded video: caricamento oltre il tempo massimo.');
          finish(false);
        }, config.loadTimeoutMs);

        const options: RewardAdOptions = { adId: config.adId };

        await AdMob.prepareRewardVideoAd(options);

        // Caricamento terminato dopo il timeout: non mostrare piu' nulla.
        if (phase !== 'loading') return;

        cancel(loadTimer);
        phase = 'requested';

        schedule(async () => {
          if (phase !== 'requested') return;

          const state = await App.getState().catch(() => ({ isActive: true }));

          if (phase !== 'requested') return;

          // App coperta da qualcosa: l'annuncio e' quasi certamente a schermo.
          if (!state.isActive) {
            markShowing();
            return;
          }

          console.warn('Rewarded video: Showed non ricevuto in tempo.');
          finish(false);
        }, config.showStartTimeoutMs);

        /*
         * Volutamente senza await: lato nativo questa chiamata risolve solo
         * quando il premio e' guadagnato e resta pending per sempre se il video
         * viene chiuso prima o non parte. L'esito arriva dai listener; la
         * risoluzione serve solo come secondo segnale del premio.
         */
        AdMob.showRewardVideoAd()
          .then((reward?: AdMobRewardItem) => {
            if (reward) markRewarded();
          })
          .catch((error) => {
            if (phase === 'showing' || phase === 'done') return;

            console.warn('Errore show rewarded video:', error);
            finish(false);
          });
      };

      run().catch((error) => {
        console.error('Errore flusso rewarded video:', error);
        finish(false);
      });
    });
  }

  // Aspetta che l'app sia tornata in foreground dopo la pubblicita.
  private async waitAppActiveAfterAd(): Promise<void> {
    const state = await App.getState().catch(() => ({ isActive: true }));

    if (state.isActive) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      let listener: PluginListenerHandle | undefined;

      const finishWait = () => {
        if (settled) return;

        settled = true;
        clearTimeout(safetyTimeout);
        void listener?.remove();
        resolve();
      };

      /*
       * Rete di sicurezza (2026-09-16): tra il controllo di App.getState()
       * sopra e la registrazione del listener qui sotto c'e' una finestra
       * reale (entrambe chiamate cross-bridge asincrone) in cui l'app puo'
       * gia' tornare attiva. Se la transizione avviene proprio in quella
       * finestra, l'evento futuro 'appStateChange isActive:true' non arriva
       * mai: prima restavamo bloccati qui per sempre (nessun timeout), quindi
       * showRewardedAd() non risolveva mai la sua Promise e il reward -
       * accreditato solo dopo quell'await, vedi i chiamanti - non veniva mai
       * assegnato nonostante il video fosse stato guardato fino alla fine.
       * Bug reale trovato il 2026-09-16 (segnalato dall'utente: reward assenti
       * dopo aver visto il video fino in fondo su piu' flussi diversi).
       */
      const safetyTimeout = setTimeout(finishWait, 3000);

      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return;

        finishWait();
      })
        .then((handle) => {
          if (settled) {
            void handle.remove();
            return;
          }

          listener = handle;
        })
        .catch(() => finishWait());
    });
  }

  // Utility interna per piccoli ritardi controllati dopo la chiusura dell'ad.
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
