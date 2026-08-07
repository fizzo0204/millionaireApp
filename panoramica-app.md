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

Il progetto è tecnicamente solido e ben strutturato (buona separazione servizi/config, gestione accurata dei conflitti di login), ma **non è ancora pronto per una pubblicazione su Play Store**. I punti bloccanti o da verificare prima del rilascio, in ordine di priorità:

1. **AdMob è configurato con gli ID di test pubblici di Google** (sia in `ads.config.ts` che nell'`AndroidManifest.xml`, incluso l'Application ID `ca-app-pub-3940256099942544~...`). Vanno sostituiti con gli ID reali di un account AdMob collegato all'app prima del rilascio, altrimenti niente ricavi pubblicitari.
2. **Il pannello "debug" nella pagina Impostazioni è visibile a tutti gli utenti**, non solo in sviluppo: c'è un TODO nel codice (`settings.page.html`) che dice di riattivare il controllo che lo nasconde in produzione, ma il controllo attualmente non è applicato. Un utente qualsiasi può quindi vedere/premere bottoni come "Reset debug" (cancella XP, livelli, cronologia) o forzare il giorno delle reward giornaliere.
3. **Manca la funzione di cancellazione account/dati** per gli utenti che hanno effettuato login (Google/Facebook/Play Games). Google Play richiede, per le app che permettono la creazione di un account, di offrire anche cancellazione account e dati in-app (o tramite link). Al momento la cancellazione esiste solo internamente per i profili ospite durante il collegamento account.
4. **Manca una privacy policy** collegata all'app (né in-app né nella scheda Play Store attesa). È obbligatoria, tanto più con AdMob, Facebook Login e Firebase in uso.
5. **Manca la gestione del consenso GDPR/pubblicità** (Google User Messaging Platform) per utenti UE/UK: obbligatoria per gli editori AdMob che servono utenti europei.
6. **Certificato di firma release non ancora registrato su Firebase**: `google-services.json` contiene solo l'impronta SHA-1 di debug. Se non si aggiunge anche l'SHA-1 (e quello di Play App Signing) del keystore di release nella console Firebase, login Google/Facebook/Play Games smetteranno di funzionare nella build pubblicata.
7. **L'economia di gioco (monete, XP, vite, livelli) è interamente calcolata e scritta dal client** verso Firestore, con le regole di sicurezza che verificano solo la proprietà del documento e non i valori scritti. Non è bloccante per una v1 senza acquisti reali, ma è un vettore di cheat noto (un utente smaliziato può scriversi monete/XP arbitrari via SDK Firestore) da tenere presente se in futuro si aggiungono classifiche o acquisti reali.
8. **Build di release non minificata** (`minifyEnabled false` in `android/app/build.gradle`, nonostante esistano regole ProGuard): da valutare l'attivazione di R8/ProGuard per dimensione e protezione minima del codice, testando bene le librerie native (Facebook/Google Sign-In) che a volte richiedono regole `-keep` dedicate.
9. `capacitor.config.ts` abilita `cleartext: true` globalmente (pensato per il debug locale) — da restringere alle sole build di sviluppo prima del rilascio.

Nessuno di questi punti riguarda bug funzionali del gameplay in sé: il quiz, la progressione e il login funzionano correttamente nei loro flussi principali. Sono soprattutto criticità di "prontezza per la pubblicazione" (compliance Play Store, monetizzazione, igiene della build di release).
