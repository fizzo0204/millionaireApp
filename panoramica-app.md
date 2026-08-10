# Panoramica di TurtleMind

Questo documento serve a dare rapidamente contesto su cos'è TurtleMind a chi (persona o assistente) non ha familiarità con il progetto.

## Cos'è

TurtleMind è un'app mobile di quiz a risposta multipla in italiano, in stile "gioco a premi" gamificato. L'utente sceglie una categoria (Sport, Cinema, Storia, Geografia, Scienza, Musica, Tecnologia, Altro), affronta livelli di difficoltà crescente e guadagna XP, monete virtuali ("TurtleCoins") e progressi che sbloccano nuovi contenuti.

- **Piattaforma target**: Android (Google Play Store). Il progetto è un'app web Ionic/Angular impacchettata con Capacitor; non è (ancora) pubblicato su iOS.
- **Package name**: `com.turtlemind.app`.
- **Stato**: in sviluppo attivo, pre-pubblicazione (`version: 0.0.1`, `versionCode 1`). Non è ancora live su Play Store.

## Meccaniche di gioco

- **Quiz a livelli**: domande a risposta multipla organizzate per categoria e difficoltà; completare un livello con tutte risposte corrette dà una ricompensa in XP.
- **Sistema di progressione**: XP, livelli utente (fino a un livello massimo configurabile), level-up con ricompensa in monete.
- **Vite (lives)**: l'utente ha un numero massimo di vite che si consumano giocando e si rigenerano nel tempo (meccanica free-to-play classica per creare attesa/re-engagement).
- **TurtleCoins**: valuta virtuale guadagnata giocando o guardando video pubblicitari a premio, spendibile nello shop (avatar, sblocchi cosmetici). Non c'è ancora acquisto in-app con soldi veri (Google Play Billing non è integrato: lo shop al momento usa solo la valuta virtuale).
- **Arcade / "Scalata"**: modalità a livelli progressivi separata dal quiz per categoria.
- **Eventi giornalieri**: missioni giornaliere, ruota della fortuna, sfida giornaliera, daily reward a giorni consecutivi (con avatar/premi dedicati).
- **Achievement e avatar**: obiettivi sbloccabili e collezione di avatar (alcuni ottenibili solo da reward giornaliere).
- **Tutorial**: guida al primo avvio per i nuovi utenti.

## Account e identità utente

- Al primo avvio l'utente ottiene automaticamente un **accesso anonimo Firebase** (ospite giocabile fin da subito, senza schermata di login obbligatoria).
- L'utente può poi collegare l'account a **Google, Facebook o Google Play Games**; il collegamento avviene mantenendo lo stesso `uid` Firebase, così i progressi da ospite non vengono persi. Il primo collegamento riuscito a un provider reale dà anche un premio una tantum di **50 TurtleCoins**, per incentivare a proteggere i progressi (vedi `AUTH_CONFIG.linkReward`).
- È gestita la casistica di conflitto: se il provider scelto ha già un profilo TurtleMind esistente, l'utente viene avvisato prima di sovrascrivere il profilo corrente.

## Monetizzazione

- **Pubblicità**: banner e video a premio (rewarded ads) tramite Google AdMob (`@capacitor-community/admob`). I video a premio danno TurtleCoins e contano per le missioni giornaliere.
- **Acquisti in-app**: non ancora implementati (nessuna libreria di Play Billing nel progetto); lo shop interno è basato solo su valuta virtuale guadagnata giocando/guardando ads.

## Stack tecnico (in breve)

Ionic + Angular 20 (standalone components) + Capacitor per il bridge nativo Android, Firebase (Authentication + Firestore) come unico backend — non esiste un server/API proprio, tutta la logica applicativa vive nel client e parla direttamente con Firestore, protetto da regole di sicurezza (`firestore.rules`). Dettagli architetturali e comandi di sviluppo sono in `CLAUDE.md`.

## Stato di avanzamento e cose aperte prima della pubblicazione

Il progetto è tecnicamente solido e ben strutturato (buona separazione servizi/config, gestione accurata dei conflitti di login), ma **non è ancora pronto per una pubblicazione su Play Store**. Tutto quello che si poteva sistemare da codice è stato fatto (vedi sezione sotto): quello che resta aperto oggi richiede **solo azioni su account/console esterni** (AdMob, Firebase, Play Console) o una scelta consapevole al momento del rilascio — nessuna di queste richiede altro codice applicativo, solo configurazione. Sono il punto di partenza giusto per una prossima sessione con Claude dedicata a chiudere la pubblicazione:

1. **La privacy policy è scritta, pubblicata e linkata in-app**: vive su Firebase Hosting (`public-site/privacy-policy.html`) all'URL `https://millionaire-app-69005.web.app/privacy-policy.html`, URL configurato in `src/app/config/legal.config.ts` e mostrato come link discreto in fondo a Impostazioni (sotto le card, volutamente meno prominente). Resta solo da inserirla nella scheda Play Store quando la crei.
2. **Manca la gestione del consenso GDPR/pubblicità** (Google User Messaging Platform) per utenti UE/UK: obbligatoria per gli editori AdMob che servono utenti europei. L'account AdMob reale ora esiste (vedi "Punti risolti" sotto), quindi questo punto è sbloccabile subito.
3. **Certificato di firma release non ancora registrato su Firebase**: `google-services.json` contiene solo l'impronta SHA-1 di debug. Serve: generare/recuperare il keystore di release, prendere il suo SHA-1 (e quello di Play App Signing una volta caricata la prima build su Play Console), e aggiungerli entrambi all'app Android nella console Firebase. Senza questo, login Google/Facebook/Play Games smettono di funzionare nella build pubblicata.
4. **Build di release non minificata** (`minifyEnabled false` in `android/app/build.gradle`, nonostante esistano già regole ProGuard pronte in `proguard-rules.pro`): da valutare l'attivazione di R8/ProGuard per dimensione e protezione minima del codice. Serve testarla su una build di release reale e firmata (Facebook/Google Sign-In a volte si rompono senza regole `-keep` dedicate) — non ha senso farlo prima di avere un keystore di release (vedi punto 3).

Punti risolti:
- **Privacy policy pubblicata (2026-08-10)**: testo completo (dati raccolti, basi giuridiche GDPR, condivisione con terzi, diritti dell'utente, cancellazione account, minori) su Firebase Hosting. `index.html`/`404.html` in `public-site/` sono ancora il template di default del CLI Firebase (homepage placeholder "Firebase Hosting Setup Complete"), non un problema per la privacy policy in sé ma da personalizzare se in futuro serve altro su quel dominio.
- La **cancellazione account** (requisito Google Play per app con creazione account) — vedi `AuthService.deleteAccount()` e il bottone "Elimina account" in Impostazioni (visibile solo per profili con accesso reale, non l'ospite anonimo).
- **Sessione di pulizia pre-pubblicazione (2026-08-10)**: rimossi del tutto i pulsanti/pannello di debug e reset da Impostazioni (erano visibili a tutti gli utenti in produzione, non solo mal gatekeepati), insieme al codice di servizio diventato morto di conseguenza; disabilitato `cleartext` in `capacitor.config.ts` (verificato che il flusso di sviluppo reale — build completa + Android Studio, mai live-reload — non ne ha bisogno); allineato `versionName` Android a `package.json` (`0.0.1` in entrambi); ripuliti i metadati boilerplate di `package.json` (author/homepage/description ereditati dallo scaffold Ionic); rimossi i 3 `console.log` di puro rumore su 65 totali (il resto sono `console.warn`/`error` legittimi nei catch, unica visibilità su errori in campo); implementato il premio di collegamento account (50 TurtleCoins una tantum, vedi sopra).
- **AdMob con ID reali (2026-08-10)**: account AdMob collegato, ID reali sostituiti in `ads.config.ts` e `AndroidManifest.xml` (Application ID `ca-app-pub-8570204656148700~8038470759`, banner e rewarded dedicati). Verificato che non restano riferimenti all'Application ID di test e che la build di produzione li include correttamente. **Non ancora verificato il caricamento reale degli annunci su un dispositivo/emulatore Android** (l'ambiente di sviluppo usato per questa sessione non ha SDK Android/emulatore disponibile) — da fare aprendo il progetto in Android Studio dopo `npx cap sync android`. L'account è inoltre in revisione automatica Google (di solito entro 24h): è normale non vedere impression reali nei primissimi test.

Nota sull'economia di gioco: monete, XP, vite e livelli sono calcolati e scritti dal client verso Firestore, con le regole di sicurezza che verificano solo la proprietà del documento, non i valori scritti. Diversi buchi concreti di questo tipo (streak daily reward che non si resettava, raddoppio ruota senza limite server-side, ecc.) sono stati trovati e sistemati durante un giro di revisione completo del codice — vedi sotto. Resta comunque un vettore di cheat noto in generale (un client modificato può scriversi monete/XP arbitrari), da tenere presente se in futuro si aggiungono classifiche o acquisti reali.

## Revisione bug completata

Nell'agosto 2026 è stato fatto un giro sistematico di analisi e fix su tutto `src/app` (logica **e** template), non solo sui punti di pubblicazione sopra. Bug reali trovati e corretti: streak del daily reward che non si resettava mai sui giorni saltati, raddoppio del premio della ruota senza controllo server-side, mettere l'app in background durante la sfida giornaliera che costava una vita, "Cambia domanda" che poteva far pagare monete senza cambiare la domanda, un account Firebase Auth "fantasma" creato dal controllo pre-login, `auth.providerIds` che poteva essere sovrascritto con un provider indovinato, un avatar sbloccabile perso per una scrittura Firestore non atomica, il riquadro suggerimenti del tutorial mai mostrato per 5 step su 9, e un potenziale crash nel render delle vite con un valore negativo. Se in futuro si trova un comportamento strano in una di queste aree, controllare prima la cronologia commit di quel periodo prima di ripartire da zero.
