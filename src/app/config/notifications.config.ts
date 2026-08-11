export const NOTIFICATIONS_CONFIG = {
  ids: {
    livesFull: 1001,
    dailyReward: 1002,
  },
  // Canale dedicato (non il "default" del plugin, che nasce con importanza
  // Default/silenziosa e non e' piu' modificabile una volta creato su
  // Android): con importanza Alta la notifica fa popup + suono, altrimenti
  // finisce silenziosa nel cassetto e passa facilmente inosservata.
  channelId: 'reminders',
  channelName: 'Promemoria',
  dailyReminderHour: 20,
  fallbackDelayMinutes: 30,
  copy: {
    livesFull: {
      title: 'Vite piene!',
      body: 'Le tue vite sono tornate al massimo. Torna a giocare!',
      // res/drawable/ic_stat_heart.xml (icona "heart" di ionicons)
      smallIcon: 'ic_stat_heart',
    },
    dailyReward: {
      title: 'Il tuo regalo ti aspetta',
      body: 'Riscuoti il premio giornaliero prima che scada!',
      // res/drawable/ic_stat_gift.xml (icona "gift" di ionicons)
      smallIcon: 'ic_stat_gift',
    },
  },
};
