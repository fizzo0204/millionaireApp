export const APP_CONFIG = {
  loaderDuration: 2200,
  /*
   * Tetto massimo di attesa dello splash iniziale per il primo utente
   * autenticato (auth.user$), oltre alla sola loaderDuration fissa. Su
   * device/reti lente la catena di avvio (platform.ready → eventuale
   * auto-login Play Games → ensureUserProfile su Firestore) puo' richiedere
   * diversi secondi: senza questa attesa lo splash spariva subito e l'utente
   * si ritrovava header/navbar/home gia' visibili ma non ancora funzionanti
   * (nessun dato utente caricato) per il tempo restante. Se questo tetto
   * scade (es. del tutto offline al primo avvio), mostriamo comunque l'app
   * invece di restare bloccati sullo splash per sempre.
   */
  loaderAuthWaitMs: 12000,
  hiddenBottomNavRoutes: [
    '/difficulty',
    '/levels',
    '/quiz',
    '/daily-challenge',
    '/arcade',
  ],
};
