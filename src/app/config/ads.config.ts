export const ADS_CONFIG = {
  banner: {
    adId: 'ca-app-pub-8570204656148700/5403854545',
  },

  rewarded: {
    adId: 'ca-app-pub-8570204656148700/7822848339',

    /*
     * Tempi del flusso rewarded (vedi AdsService.runRewardedAd()). Nessuno di
     * questi limita la durata dell'annuncio una volta mostrato: un annuncio
     * reale (video + schermata finale/playable) puo' superare il minuto.
     */
    // Tetto al solo caricamento (prepareRewardVideoAd).
    loadTimeoutMs: 30000,
    // Tetto tra la richiesta di show e l'evento Showed.
    showStartTimeoutMs: 15000,
    // Attesa del Rewarded se arriva dopo il Dismissed (alcuni adapter di mediazione).
    rewardGraceMs: 1500,
    // Intervallo del watchdog che rileva un Dismissed perso (app tornata attiva).
    watchdogIntervalMs: 2000,
    // Letture "app attiva" consecutive prima che il watchdog chiuda il flusso.
    watchdogActiveChecks: 2,
  },
};
