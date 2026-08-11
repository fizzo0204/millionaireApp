# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cosa fare prima

Leggi `panoramica-app.md` per capire cos'è TurtleMind, il modello di business e lo stato del progetto. Questo file (`CLAUDE.md`) copre solo comandi e architettura tecnica.

## Comandi

Il progetto è Ionic/Angular con Capacitor per la parte Android. Non ci sono script npm oltre a quelli di default di Angular CLI.

```bash
npm start              # ng serve, dev server web su http://localhost:4200
npm run build           # ng build (defaultConfiguration è "production" in angular.json: usa environment.prod.ts anche senza flag!)
npm run watch            # ng build --watch --configuration development
npm test                # ng test (Karma + Jasmine)
npm run lint            # ng lint (ESLint, regole @angular-eslint)
```

- **Attenzione**: `angular.json` → `architect.build.defaultConfiguration` è `"production"`. Questo significa che `ng build`/`npm run build`/`ionic build` senza `--configuration` esplicito applicano comunque il `fileReplacements` di produzione (`environment.ts` → `environment.prod.ts`, `production: true`), anche se sembra un comando "neutro". Per una build di sviluppo (quella con gli strumenti di debug gatekeepati da `environment.production` visibili) serve sempre `--configuration development` esplicito: `ionic build --configuration development` o `ng build --configuration development`.
- Non ci sono suite e2e configurate.
- Per eseguire un singolo test Karma, filtra da browser (Karma apre Chrome) oppure usa `fdescribe`/`fit` temporanei nello spec — non c'è un runner headless con filtro da CLI pre-configurato.

### Android (Capacitor)

```bash
npx cap sync android     # copia www/ + plugin nel progetto Android dopo ng build
npx cap open android     # apre Android Studio
```

Il flusso reale è: `ng build` → `npx cap sync android` → build/run da Android Studio o `android/gradlew`. La cartella `www/` è generata (ignorata da git) ed è il `webDir` di Capacitor.

## Workflow di sviluppo

Dopo aver completato una fix o una nuova funzionalità (e prima di riportarla come conclusa):

1. Lancia `ionic build --configuration development` seguito da `npx cap sync android` — build di sviluppo, così restano visibili gli strumenti di debug gatekeepati con `environment.production` (vedi Convenzioni). Vedi la nota sopra: senza `--configuration development` esplicito si finisce in produzione anche per sbaglio.
2. Non fare commit né push in automatico a fine lavoro: di' semplicemente che la modifica è pronta e che si può aprire Android Studio (`npx cap open android`) e testare direttamente sul device/emulatore. Commit e push restano un'azione esplicita, solo su richiesta.

## Architettura

App Ionic/Angular (standalone components, Angular 20) impacchettata con Capacitor per Android. **Non esiste backend proprio**: nessuna Cloud Function, nessun server custom. Tutta la logica applicativa gira nel client Angular e parla direttamente con Firebase (Auth + Firestore) via `@angular/fire`. La sicurezza dei dati è delegata interamente a `firestore.rules`.

### Struttura `src/app/`

- `pages/` — una cartella per rotta/schermata (home, quiz, arcade, shop, levels, difficulty, events*, settings, profile, login). Ogni pagina è uno standalone component Ionic (`*.page.ts/html/scss`).
- `components/` — componenti riusabili, principalmente modali (daily-reward, level-up, achievement-toast, chest-cinematic, tutorial-overlay, ecc.).
- `services/` — tutta la logica di stato/dati, iniettati come singleton (`providedIn: 'root'`). Vedi sotto per il pattern dominante.
- `config/` — costanti di configurazione tipizzate per dominio (`user-stats.config.ts`, `lives.config.ts`, `ads.config.ts`, `daily-reward.config.ts`, ecc.). Quando cambi bilanciamento del gioco (XP, monete, vite, timer), i valori sono quasi sempre qui, non hardcoded nei componenti.
- `data/` — dataset statici lato client (categorie quiz, achievement, avatar, difficoltà, reward giornaliere).
- `models/` — interfacce TypeScript dei documenti Firestore e dei value object.

### Pattern dati: Firestore come unica fonte di verità, letta in streaming

Quasi ogni servizio di stato (`CoinsService`, `LivesService`, `UserStatsService`, ecc.) segue lo stesso pattern:

1. Si sottoscrive a `AuthService.user$`.
2. Apre uno stream `docData()` su `users/{uid}` (o una sua sottocollezione) e espone un `BehaviorSubject`/`Observable` pubblico (es. `coins$`, `lives$`).
3. Le scritture (`addCoins`, `spendCoins`, `spendLife`, `recordQuizResult`, ...) usano `runTransaction`/`updateDoc` direttamente dal client, con `runInInjectionContext` perché sono chiamate fuori dal contesto di injection standard di Angular.

Non c'è validazione server-side degli importi: il client calcola XP/monete/vite e scrive il risultato. `firestore.rules` verifica solo che `request.auth.uid` corrisponda al documento (owner-only), non il contenuto della scrittura. Tienilo presente quando aggiungi nuove ricompense: il pattern esistente è "fidati del client", non introdurre asimmetrie silenziose (es. una ricompensa validata lato regole e le altre no) senza motivarlo esplicitamente.

### Documento utente (`users/{uid}`)

Un solo documento per utente contiene quasi tutto lo stato di gioco (`stats.coins`, `stats.xp`, `stats.level`, `stats.lives`, `dailyReward`, `avatar`, `onboarding`, `arcade`, `dailyEvents`), con sottocollezioni per cronologia (`completedLevels`, `quizHistory`, `progress`). Vedi `UserDebugDataService` per la lista canonica dei default e delle sottocollezioni, e `UserStatsService` come facciata principale usata dal resto dell'app.

### Autenticazione e collegamento account

`AuthService` è il file più complesso del progetto: gestisce login anonimo automatico all'avvio, poi collegamento (`linkWithCredential`) a Google/Facebook/Play Games mantenendo lo stesso `uid` (e quindi stats/monete/progressi) invece di creare un utente nuovo. La gestione dei conflitti ("questo provider ha già un profilo TurtleMind") è delegata a `AuthAccountLinkService` e alla modale `account-conflict-modal`. Se tocchi il flusso di login, leggi prima `AuthService.resolveInitialAuthState` e `shouldLinkCurrentProfileToProvider` per capire le regole di precedenza tra ospite/Play Games/Google/Facebook.

Ogni primo collegamento riuscito (stesso uid preservato) converge su `AuthService.completeCurrentProfileAccountLink`, l'unico punto comune a Google/Facebook/Play Games: qui viene assegnato anche il premio una tantum per il collegamento (`UserStatsService.claimLinkReward`, importi in `AUTH_CONFIG.linkReward`), tracciato con il campo `auth.loginRewardClaimed` del profilo utente. Se disabiliti o cambi questo premio, aggiorna `AUTH_CONFIG.linkReward.enabled/coins/xp`, non serve toccare `completeCurrentProfileAccountLink`.

Il login nativo Android passa da `@capacitor-firebase/authentication` con `skipNativeAuth: true`: il plugin recupera solo il token, il link/sign-in vero avviene nel Firebase JS SDK (per non perdere l'uid dell'ospite).

`AuthService.deleteAccount()` cancella prima i dati Firestore e solo dopo l'account Firebase Auth, mai il contrario: `firestore.rules` richiede `request.auth.uid` per cancellare `users/{uid}`, e quell'autenticazione sparisce nel momento stesso in cui l'account Auth viene eliminato. Se estendi questo flusso, mantieni l'ordine "dati poi account".

### Ads e monetizzazione

`AdsService` incapsula `@capacitor-community/admob` (banner + rewarded video). Gli ID annuncio sono in `src/app/config/ads.config.ts`. Non c'è integrazione Google Play Billing: lo shop (`shop.page.ts`) spende solo la valuta virtuale (`TurtleCoins`) tramite `CoinsService`.

`AdsService.initialize()` non chiama `AdMob.initialize()` direttamente: prima passa da `ensureConsent()`, che gestisce il flusso GDPR/UMP (`AdMob.requestConsentInfo()` + `AdMob.showConsentForm()` se richiesto) e inizializza AdMob solo se `canRequestAds` è vero. Se aggiungi un nuovo punto che mostra annunci, passa sempre da `initialize()`/`showBanner()`/`showRewardedAd()` esistenti invece di chiamare `AdMob` direttamente, altrimenti salti il consenso. Il banner usa `BannerAdSize.ADAPTIVE_BANNER`, non `BANNER`: quest'ultimo veniva renderizzato vicino al bordo sinistro invece che centrato per un bug di `@capacitor-community/admob` nel calcolo dei margini (non c'entra il nostro codice).

### Notifiche locali

`NotificationsService` (`src/app/services/notifications.service.ts`) usa `@capacitor/local-notifications`, non push FCM: niente backend proprio, quindi i due eventi (vite piene, daily reward/streak in scadenza) vengono calcolati e schedulati interamente dal client in base a dati già noti (`LivesService.getFullRecoveryDate()`, `DailyRewardService.getState().claimedToday`). Config in `src/app/config/notifications.config.ts` (id notifiche, canale, orario reminder, testi).

- Il canale usato è `reminders` (importanza Alta, creato via `LocalNotifications.createChannel()` a ogni avvio, idempotente) — **non** il canale `default` auto-creato dal plugin, che nasce con importanza silenziosa e non è più modificabile una volta creato su Android.
- Il permesso Android viene richiesto la prima volta dopo il primo claim del daily reward (`daily-reward-modal.component.ts`), non al primo avvio a freddo.
- `AppComponent.listenToAppState()` chiama comunque `notificationsService.scheduleAll()` quando l'app va in background (`appStateChange` con `isActive: false`), come rete di sicurezza aggiuntiva, ma **non è il trigger principale** — vedi sotto. Volutamente **non** chiama `cancelAll()` al ritorno in foreground: `LocalNotifications.cancel()` rimuove anche una notifica già consegnata e visibile, non solo il timer futuro — cancellarla al rientro in app cancellava/nascondeva notifiche appena arrivate. Lo stato si autocorregge comunque al prossimo giro in background.
- **Le notifiche vengono schedulate in modo proattivo, non aspettando il background**: `NotificationsService` si sottoscrive direttamente a `LivesService.lives$` e richiama `scheduleAll()` ogni volta che il numero di vite cambia; per il daily reward, `daily-reward-modal.component.ts` chiama `scheduleAll()` subito dopo un claim riuscito. Questo non è solo un'ottimizzazione: **schedulare solo su `appStateChange isActive:false` si è rivelato inaffidabile su device reali** (confermato su un Motorola, ma è un comportamento comune a molti produttori Android con battery management aggressivo) — il processo dell'app può essere ucciso dal sistema pochi istanti dopo il backgrounding (`ActivityManager: Killing ... remove task` visto con `adb shell dumpsys alarm`/`logcat` circa 1 secondo dopo il background), troppo presto perché la catena asincrona verso il plugin nativo (`checkPermissions()` → `LocalNotifications.schedule()`, entrambe chiamate cross-bridge) faccia in tempo a completarsi. Schedulando invece mentre l'app è sicuramente viva e in primo piano, il problema non si presenta.
- Nota di ordinamento in `LivesService.listenToUserLives()`: `lastLifeUpdateTime` viene aggiornato **prima** di `livesSubject.next(lives)`, apposta — chi si sottoscrive a `lives$` (come `NotificationsService`) reagisce in modo sincrono dentro `next()` e deve già vedere il valore coerente, non quello della emissione precedente.
- **Non a rischio il tetto di allarmi per-app di Android** (`max_alarms_per_uid`, 500 di default, verificato con `adb shell dumpsys alarm`): il servizio usa solo 2 id fissi (`NOTIFICATIONS_CONFIG.ids.livesFull`/`dailyReward`), e ogni nuova schedulazione con lo stesso id sostituisce la precedente (`PendingIntent.FLAG_CANCEL_CURRENT` lato plugin) invece di accumularsi. Un utente ha quindi sempre al massimo 2 allarmi pendenti, indipendentemente da quante volte perde/recupera vite. Se in futuro si aggiungono altri tipi di notifica, mantenere questo pattern (id fisso e riusato) e non generare mai id nuovi/incrementali ad ogni schedulazione.

### Convenzioni

- Testo dei commenti e nomi di alcuni servizi/metodi sono in italiano (es. `quiz-completamento.service.ts`, `completaQuizNormale`); segui questa convenzione quando estendi quei file invece di passare all'inglese a metà file.
- Componenti Angular standalone ovunque (no NgModules applicativi); direttive/selettori con prefisso `app-` (kebab-case per componenti, camelCase per direttive), imposto da `.eslintrc.json`.
- I pulsanti/pannelli di debug (reset dati, simulatori di giorno, ecc.) sono stati rimossi del tutto da Impostazioni prima della pubblicazione — erano visibili a tutti gli utenti in produzione, non solo gatekeepati male. Se in futuro serve un nuovo strumento di debug, gatekeepalo fin da subito con `environment.production` (es. `@if (!environment.production)`), non aggiungerlo "temporaneamente" senza guardia: è esattamente il tipo di codice che rischia di restare in produzione inosservato.
