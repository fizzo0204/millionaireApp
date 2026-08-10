# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cosa fare prima

Leggi `panoramica-app.md` per capire cos'è TurtleMind, il modello di business e lo stato del progetto. Questo file (`CLAUDE.md`) copre solo comandi e architettura tecnica.

## Comandi

Il progetto è Ionic/Angular con Capacitor per la parte Android. Non ci sono script npm oltre a quelli di default di Angular CLI.

```bash
npm start              # ng serve, dev server web su http://localhost:4200
npm run build           # ng build (usa environment.ts, non prod)
npm run watch            # ng build --watch --configuration development
npm test                # ng test (Karma + Jasmine)
npm run lint            # ng lint (ESLint, regole @angular-eslint)
```

- Non esiste un target `build --configuration production` esplicito in `package.json`: per una build di produzione va lanciato `ng build --configuration production` a mano.
- Non ci sono suite e2e configurate.
- Per eseguire un singolo test Karma, filtra da browser (Karma apre Chrome) oppure usa `fdescribe`/`fit` temporanei nello spec — non c'è un runner headless con filtro da CLI pre-configurato.

### Android (Capacitor)

```bash
npx cap sync android     # copia www/ + plugin nel progetto Android dopo ng build
npx cap open android     # apre Android Studio
```

Il flusso reale è: `ng build` → `npx cap sync android` → build/run da Android Studio o `android/gradlew`. La cartella `www/` è generata (ignorata da git) ed è il `webDir` di Capacitor.

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

### Convenzioni

- Testo dei commenti e nomi di alcuni servizi/metodi sono in italiano (es. `quiz-completamento.service.ts`, `completaQuizNormale`); segui questa convenzione quando estendi quei file invece di passare all'inglese a metà file.
- Componenti Angular standalone ovunque (no NgModules applicativi); direttive/selettori con prefisso `app-` (kebab-case per componenti, camelCase per direttive), imposto da `.eslintrc.json`.
- I pulsanti/pannelli di debug (reset dati, simulatori di giorno, ecc.) sono stati rimossi del tutto da Impostazioni prima della pubblicazione — erano visibili a tutti gli utenti in produzione, non solo gatekeepati male. Se in futuro serve un nuovo strumento di debug, gatekeepalo fin da subito con `environment.production` (es. `@if (!environment.production)`), non aggiungerlo "temporaneamente" senza guardia: è esattamente il tipo di codice che rischia di restare in produzione inosservato.
