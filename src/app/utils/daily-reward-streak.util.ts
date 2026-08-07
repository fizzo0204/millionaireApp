// Formatta una data locale come chiave "YYYY-MM-DD".
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// Chiave della data odierna, usata per confrontare i claim del daily reward.
export function getTodayKey(): string {
  return formatDateKey(new Date());
}

// Sposta una chiave "YYYY-MM-DD" di un numero di giorni (anche negativo).
export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + days);

  return formatDateKey(date);
}

/*
 * Il giorno 1-7 del daily reward avanza solo se l'ultimo claim risale a
 * ieri. Se e' passato piu' di un giorno la streak si e' interrotta: si
 * riparte dal giorno 1 anche se in Firestore era rimasto un giorno piu'
 * avanti (altrimenti chi torna dopo settimane continua la streak da dove
 * l'aveva lasciata).
 */
export function resolveStreakDay(
  currentDay: number,
  lastClaimDate: string | null,
  todayKey: string,
): number {
  if (!lastClaimDate) return currentDay;
  if (lastClaimDate === todayKey) return currentDay;
  if (lastClaimDate === shiftDateKey(todayKey, -1)) return currentDay;

  return 1;
}
