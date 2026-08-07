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
- L'utente può poi collegare l'account a **Google, Facebook o Google Play Games**; il collegamento avviene mantenendo lo stesso `uid` Firebase, così i progressi da ospite non vengono persi.
- È gestita la casistica di conflitto: se il provider scelto ha già un profilo TurtleMind esistente, l'utente viene avvisato prima di sovrascrivere il profilo corrente.

## Monetizzazione

- **Pubblicità**: banner e video a premio (rewarded ads) tramite Google AdMob (`@capacitor-community/admob`). I video a premio danno TurtleCoins e contano per le missioni giornaliere.
- **Acquisti in-app**: non ancora implementati (nessuna libreria di Play Billing nel progetto); lo shop interno è basato solo su valuta virtuale guadagnata giocando/guardando ads.

## Stack tecnico (in breve)

Ionic + Angular 20 (standalone components) + Capacitor per il bridge nativo Android, Firebase (Authentication + Firestore) come unico backend — non esiste un server/API proprio, tutta la logica applicativa vive nel client e parla direttamente con Firestore, protetto da regole di sicurezza (`firestore.rules`). Dettagli architetturali e comandi di sviluppo sono in `CLAUDE.md`.

## Stato di avanzamento e cose aperte prima della pubblicazione

Il progetto è tecnicamente solido e ben strutturato (buona separazione servizi/config, gestione accurata dei conflitti di login), ma **non è ancora pronto per una pubblicazione su Play Store**. I punti bloccanti o da verificare prima del rilascio, in ordine di priorità — tutti richiedono un'azione fuori dal codice (account/console esterni) o una scelta consapevole al momento del rilascio, per questo restano aperti:

1. **AdMob è configurato con gli ID di test pubblici di Google** (sia in `ads.config.ts` che nell'`AndroidManifest.xml`, incluso l'Application ID `ca-app-pub-3940256099942544~...`). Vanno sostituiti con gli ID reali di un account AdMob collegato all'app prima del rilascio, altrimenti niente ricavi pubblicitari.
2. **Il pannello "debug" nella pagina Impostazioni è visibile a tutti gli utenti**, non solo in sviluppo: c'è un TODO nel codice (`settings.page.html`) che dice di riattivare il controllo che lo nasconde in produzione, ma il controllo attualmente non è applicato. Lasciato così di proposito finché l'app resta in sviluppo.
3. **Manca una privacy policy** collegata all'app (né in-app né nella scheda Play Store attesa). È obbligatoria, tanto più con AdMob, Facebook Login e Firebase in uso.
4. **Manca la gestione del consenso GDPR/pubblicità** (Google User Messaging Platform) per utenti UE/UK: obbligatoria per gli editori AdMob che servono utenti europei. Richiede anche l'account AdMob reale del punto 1.
5. **Certificato di firma release non ancora registrato su Firebase**: `google-services.json` contiene solo l'impronta SHA-1 di debug. Se non si aggiunge anche l'SHA-1 (e quello di Play App Signing) del keystore di release nella console Firebase, login Google/Facebook/Play Games smetteranno di funzionare nella build pubblicata.
6. **Build di release non minificata** (`minifyEnabled false` in `android/app/build.gradle`, nonostante esistano regole ProGuard): da valutare l'attivazione di R8/ProGuard per dimensione e protezione minima del codice, testando bene su una build di release reale (Facebook/Google Sign-In a volte richiedono regole `-keep` dedicate) prima di attivarlo.
7. `capacitor.config.ts` abilita `cleartext: true` globalmente (pensato per il debug locale) — da restringere alle sole build di sviluppo. Rimandato al momento del rilascio: oggi non esiste uno script che distingua build dev/release per Capacitor.

Punto risolto: la **cancellazione account** (requisito Google Play per app con creazione account) è stata implementata — vedi `AuthService.deleteAccount()` e il bottone "Elimina account" in Impostazioni (visibile solo per profili con accesso reale, non l'ospite anonimo).

Nota sull'economia di gioco: monete, XP, vite e livelli sono calcolati e scritti dal client verso Firestore, con le regole di sicurezza che verificano solo la proprietà del documento, non i valori scritti. Diversi buchi concreti di questo tipo (streak daily reward che non si resettava, raddoppio ruota senza limite server-side, ecc.) sono stati trovati e sistemati durante un giro di revisione completo del codice — vedi sotto. Resta comunque un vettore di cheat noto in generale (un client modificato può scriversi monete/XP arbitrari), da tenere presente se in futuro si aggiungono classifiche o acquisti reali.

## Revisione bug completata

Nell'agosto 2026 è stato fatto un giro sistematico di analisi e fix su tutto `src/app` (logica **e** template), non solo sui punti di pubblicazione sopra. Bug reali trovati e corretti: streak del daily reward che non si resettava mai sui giorni saltati, raddoppio del premio della ruota senza controllo server-side, mettere l'app in background durante la sfida giornaliera che costava una vita, "Cambia domanda" che poteva far pagare monete senza cambiare la domanda, un account Firebase Auth "fantasma" creato dal controllo pre-login, `auth.providerIds` che poteva essere sovrascritto con un provider indovinato, un avatar sbloccabile perso per una scrittura Firestore non atomica, il riquadro suggerimenti del tutorial mai mostrato per 5 step su 9, e un potenziale crash nel render delle vite con un valore negativo. Se in futuro si trova un comportamento strano in una di queste aree, controllare prima la cronologia commit di quel periodo prima di ripartire da zero.
