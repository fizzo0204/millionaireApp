export const PROFILE_CONFIG = {
  // Nickname oltre questa lunghezza facevano sporgere il bottone profilo
  // dalla navbar (fix 2026-08-18). Il limite si applica sia al nickname
  // salvato esplicitamente dall'utente (profile.page.ts) sia al fallback
  // sul nome del provider social quando l'utente non ne ha mai impostato
  // uno (login-button.component.ts/profile.page.ts getPlayerName): senza
  // troncare anche il fallback, un nome social lungo (es. "Konstantinos")
  // riapriva lo stesso overflow. Bug reale trovato in un audit il
  // 2026-09-14.
  nicknameMaxLength: 10,
};
