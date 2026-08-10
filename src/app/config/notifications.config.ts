export const NOTIFICATIONS_CONFIG = {
  ids: {
    livesFull: 1001,
    dailyReward: 1002,
    // Id separati per i test di debug: non devono mai essere toccati da
    // scheduleAll()/cancelAll() del flusso reale (che lavorano solo su
    // livesFull/dailyReward), altrimenti un ricalcolo dello stato reale
    // durante il test cancella anche la notifica di prova.
    debugLivesFull: 1901,
    debugDailyReward: 1902,
  },
  // Canale dedicato (non il "default" del plugin, che nasce con importanza
  // Default/silenziosa e non e' piu' modificabile una volta creato su
  // Android): con importanza Alta la notifica fa popup + suono, altrimenti
  // finisce silenziosa nel cassetto e passa facilmente inosservata.
  channelId: 'reminders',
  channelName: 'Promemoria',
  dailyReminderHour: 20,
  fallbackDelayMinutes: 30,
  debugDelaySeconds: 10,
  copy: {
    livesFull: {
      title: 'Vite piene!',
      body: 'Le tue vite sono tornate al massimo. Torna a giocare!',
    },
    dailyReward: {
      title: 'Il tuo regalo ti aspetta',
      body: 'Riscuoti il premio giornaliero prima che scada!',
    },
  },
};
