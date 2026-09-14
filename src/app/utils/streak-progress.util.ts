interface FirestoreTimestampLike {
  toDate(): Date;
}

function getStartOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getStartOfYesterday(): Date {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday;
}

// Calcola lo streak di giorni consecutivi di gioco a partire dall'ultima
// sessione registrata: stesso giorno mantiene lo streak, ieri lo incrementa,
// qualunque altro giorno (o nessuna sessione precedente) lo resetta a 1.
export function getUpdatedStreakDays(
  lastQuizPlayedAt: FirestoreTimestampLike | null | undefined,
  currentStreakDays: number,
): number {
  if (!lastQuizPlayedAt?.toDate) {
    return 1;
  }

  const lastPlayedDate = lastQuizPlayedAt.toDate();
  lastPlayedDate.setHours(0, 0, 0, 0);

  if (lastPlayedDate.getTime() === getStartOfToday().getTime()) {
    return currentStreakDays;
  }

  if (lastPlayedDate.getTime() === getStartOfYesterday().getTime()) {
    return currentStreakDays + 1;
  }

  return 1;
}
