import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  arrayUnion,
  doc,
  getDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { CoinsService } from './coins.service';
import { UserStatsService } from './user-stats.service';
import { UserAvatarDataService } from './user-avatar-data.service';
import { PurchasesService } from './purchases.service';

import { AvatarModel, AvatarSource } from 'src/app/models/avatar.model';
import { AVATARS } from '../data/avatars.data';

// Lanciato quando un acquisto e' stato pagato ma l'accredito su Firestore non
// e' andato a buon fine: il chiamante NON deve far ripagare l'utente, il
// recupero avviene alla riapertura dello shop (vedi riscattaAcquistiSospesi).
export class PurchaseGrantPendingError extends Error {
  constructor() {
    super(
      "Pagamento riuscito, ma l'accredito del premio non è ancora completato.",
    );
    this.name = 'PurchaseGrantPendingError';
  }
}

export type TipoForziere = 'viaggiatore' | 'maestro' | 'leggendario';

export interface ConfigForziere {
  tipo: TipoForziere;
  productId: string;
  titolo: string;
  prezzo: string;
  coins: number;
  xp: number;
  avatarSource?: AvatarSource;
  fallbackCoins?: number;
}

export interface AnteprimaForziere {
  config: ConfigForziere;
  avatarDisponibili: number;
  avatarTotali: number;
  haAvatarGarantito: boolean;
  usaFallbackCoins: boolean;
  coinsFinali: number;
  xpFinali: number;
}

export interface RisultatoForziere {
  coins: number;
  xp: number;
  avatar?: AvatarModel;
  fallbackUsato: boolean;
}

export interface RisultatoForziereRecuperato extends RisultatoForziere {
  titolo: string;
}

@Injectable({
  providedIn: 'root',
})
export class ShopService {
  private auth = inject(AuthService);
  private coinsService = inject(CoinsService);
  private userStatsService = inject(UserStatsService);
  private userAvatarDataService = inject(UserAvatarDataService);
  private purchasesService = inject(PurchasesService);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  // Serializza il grant per transactionIdentifier tra riscattaForzierePagato
  // e riscattaAcquistiSospesi, vedi eseguiGrantTransazione().
  private grantsInCorso = new Map<string, Promise<RisultatoForziere | null>>();

  readonly forzieri: ConfigForziere[] = [
    {
      tipo: 'viaggiatore',
      productId: 'chest_traveler_199',
      titolo: 'Forziere del Viaggiatore',
      prezzo: '€1,99',
      coins: 50,
      xp: 50,
    },
    {
      tipo: 'maestro',
      productId: 'chest_master_299',
      titolo: 'Forziere del Maestro',
      prezzo: '€2,99',
      coins: 150,
      xp: 150,
      avatarSource: 'daily',
      fallbackCoins: 300,
    },
    {
      tipo: 'leggendario',
      productId: 'chest_legendary_499',
      titolo: 'Forziere Leggendario',
      prezzo: '€4,99',
      coins: 400,
      xp: 400,
      avatarSource: 'epic',
      fallbackCoins: 800,
    },
  ];

  // Recupera la configurazione del forziere richiesto.
  getForziere(tipo: TipoForziere): ConfigForziere {
    const config = this.forzieri.find((item) => item.tipo === tipo);

    if (!config) {
      throw new Error(`Forziere non trovato: ${tipo}`);
    }

    return config;
  }

  // Prepara i dati prima dell'acquisto, così possiamo avvisare l'utente se ha già tutti gli avatar.
  async preparaAnteprimaForziere(
    tipo: TipoForziere,
  ): Promise<AnteprimaForziere> {
    const config = this.getForziere(tipo);
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      throw new Error('Utente non autenticato');
    }

    if (!config.avatarSource) {
      return {
        config,
        avatarDisponibili: 0,
        avatarTotali: 0,
        haAvatarGarantito: false,
        usaFallbackCoins: false,
        coinsFinali: config.coins,
        xpFinali: config.xp,
      };
    }

    const avatarData = await this.userAvatarDataService.getAvatarData(user.uid);
    const avatarTotali = this.getAvatarPerSource(config.avatarSource);
    const avatarDisponibili = avatarTotali.filter(
      (avatar) => !avatarData.unlockedAvatarIds.includes(avatar.id),
    );

    const usaFallbackCoins = avatarDisponibili.length === 0;

    return {
      config,
      avatarDisponibili: avatarDisponibili.length,
      avatarTotali: avatarTotali.length,
      haAvatarGarantito: true,
      usaFallbackCoins,
      coinsFinali: usaFallbackCoins
        ? (config.fallbackCoins ?? config.coins)
        : config.coins,
      xpFinali: config.xp,
    };
  }

  // Completa l'acquisto e assegna coins, XP ed eventuale avatar non posseduto.
  async riscattaForziere(tipo: TipoForziere): Promise<RisultatoForziere> {
    const config = this.getForziere(tipo);
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      throw new Error('Utente non autenticato');
    }

    /*
     * addCoins/addXp ignorano in silenzio uno snapshot inesistente (non
     * lanciano), per non far fallire altri chiamanti in scenari normali. Qui
     * pero' un premio "riuscito" ma non scritto verrebbe comunque segnato
     * come accreditato per sempre da riscattaForzierePagato/
     * riscattaAcquistiSospesi: verifichiamo esplicitamente l'esistenza del
     * documento prima di procedere, cosi' un doc mancante (es. race con una
     * cancellazione account parziale) fa fallire il grant in modo visibile
     * invece di "riuscire" senza scrivere nulla.
     */
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const userSnapshot = await this.runFirestore(() => getDoc(userRef));

    if (!userSnapshot.exists()) {
      throw new Error(`Documento utente inesistente per il grant: ${user.uid}`);
    }

    let avatarSbloccato: AvatarModel | undefined;
    let fallbackUsato = false;
    let coinsDaAggiungere = config.coins;

    if (config.avatarSource) {
      const avatarData = await this.userAvatarDataService.getAvatarData(
        user.uid,
      );

      const avatarDisponibili = this.getAvatarPerSource(
        config.avatarSource,
      ).filter((avatar) => !avatarData.unlockedAvatarIds.includes(avatar.id));

      if (avatarDisponibili.length > 0) {
        avatarSbloccato = this.estraiAvatarCasuale(avatarDisponibili);

        await this.userAvatarDataService.addUnlockedAvatarId(
          user.uid,
          avatarSbloccato.id,
        );
      } else {
        fallbackUsato = true;
        coinsDaAggiungere = config.fallbackCoins ?? config.coins;
      }
    }

    await this.coinsService.addCoins(coinsDaAggiungere);
    await this.userStatsService.addXp(user.uid, config.xp);

    return {
      coins: coinsDaAggiungere,
      xp: config.xp,
      avatar: avatarSbloccato,
      fallbackUsato,
    };
  }

  /*
   * Completa un acquisto gia' pagato: assegna la ricompensa e segna la
   * transazione come accreditata.
   *
   * Il grant vero e proprio (riscattaForziere) e la registrazione "gia'
   * accreditata" passano entrambi da eseguiGrantTransazione(), che serializza
   * per transactionIdentifier: questo e' l'unico modo per evitare che questo
   * metodo e riscattaAcquistiSospesi() (richiamato ad ogni apertura shop,
   * quindi possibile in parallelo se l'utente naviga via e torna mentre
   * questo acquisto e' ancora in corso) accreditino due volte lo stesso
   * pagamento reale.
   *
   * Se il grant fallisce, NON viene propagato l'errore originale: il
   * chiamante deve sapere che l'utente ha gia' pagato, non che deve
   * ripagare. Il recupero avviene alla riapertura dello shop, vedi
   * riscattaAcquistiSospesi(). Nota: riscattaForziere() non e' un'unica
   * transazione atomica (avatar, coins e xp sono tre scritture separate): un
   * fallimento a meta' seguito da un retry riuscito (qui, o nella
   * riconciliazione) puo', in casi rari, assegnare un secondo avatar o
   * monete bonus in piu' del dovuto: un rischio residuo accettato perche'
   * favorisce il giocatore, non causa mai la perdita del pagamento.
   */
  async riscattaForzierePagato(
    tipo: TipoForziere,
    transactionIdentifier: string,
  ): Promise<RisultatoForziere> {
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      throw new Error('Utente non autenticato');
    }

    let risultato: RisultatoForziere | null;

    try {
      risultato = await this.eseguiGrantTransazione(
        user.uid,
        transactionIdentifier,
        tipo,
      );
    } catch (error) {
      console.error('Errore accredito forziere pagato:', error);
      throw new PurchaseGrantPendingError();
    }

    if (risultato === null) {
      /*
       * Gia' accreditata da una chiamata concorrente (tipicamente
       * riscattaAcquistiSospesi partita in parallelo su una ShopPage
       * ricreata dalla navigazione). Non e' un errore e non va ripagata, ma
       * non abbiamo i valori realmente assegnati (l'eventuale avatar era
       * casuale): mostriamo la ricompensa di listino del forziere, il
       * premio effettivo e' comunque gia' sul profilo dell'utente.
       */
      const config = this.getForziere(tipo);
      return { coins: config.coins, xp: config.xp, fallbackUsato: false };
    }

    return risultato;
  }

  /*
   * Assegna eventuali forzieri pagati ma non ancora accreditati su Firestore
   * (es. l'app e' stata chiusa, o riscattaForzierePagato ha esaurito i
   * tentativi). RevenueCat resta la fonte di verita' su "e' stato pagato":
   * confrontiamo la sua cronologia transazioni con l'elenco di quelle gia'
   * accreditate salvato sul profilo utente. Va richiamato all'apertura dello
   * shop.
   */
  async riscattaAcquistiSospesi(): Promise<RisultatoForziereRecuperato[]> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) return [];

    const transazioni =
      await this.purchasesService.getNonSubscriptionTransactions();
    if (transazioni.length === 0) return [];

    const idsGiaAccreditati = await this.getGrantedTransactionIds(user.uid);
    const risultati: RisultatoForziereRecuperato[] = [];

    for (const transazione of transazioni) {
      if (idsGiaAccreditati.includes(transazione.transactionIdentifier)) {
        continue;
      }

      const config = this.forzieri.find(
        (item) => item.productId === transazione.productIdentifier,
      );

      if (!config) continue; // Prodotto non riconosciuto (es. rimosso dal catalogo).

      try {
        const risultato = await this.eseguiGrantTransazione(
          user.uid,
          transazione.transactionIdentifier,
          config.tipo,
        );

        // null = gia' accreditata da una chiamata concorrente
        // (riscattaForzierePagato in corso in parallelo): niente da
        // mostrare qui, il premio e' comunque gia' sul profilo.
        if (risultato) {
          risultati.push({ ...risultato, titolo: config.titolo });
        }
      } catch (error) {
        console.error(
          'Errore riscatto acquisto sospeso:',
          transazione.transactionIdentifier,
          error,
        );
        // Non segnata come accreditata: si ritentera' alla prossima apertura.
      }
    }

    return risultati;
  }

  /*
   * Serializza l'accredito di una singola transazione tra le due fonti
   * concorrenti possibili (acquisto appena pagato e riconciliazione
   * riscattaAcquistiSospesi): entrambe passano da qui, cosi' due chiamate
   * per lo stesso transactionIdentifier condividono la stessa promise invece
   * di eseguire riscattaForziere() due volte in parallelo. Il ricontrollo su
   * Firestore appena prima del grant copre anche il caso NON concorrente in
   * cui una chiamata precedente ha gia' completato e registrato la
   * transazione poco prima (es. ShopPage ricreata da una navigazione,
   * routing standard senza cache dei tab).
   */
  private eseguiGrantTransazione(
    uid: string,
    transactionIdentifier: string,
    tipo: TipoForziere,
  ): Promise<RisultatoForziere | null> {
    const inCorso = this.grantsInCorso.get(transactionIdentifier);
    if (inCorso) return inCorso;

    const operazione = (async (): Promise<RisultatoForziere | null> => {
      const giaAccreditata = await this.getGrantedTransactionIds(uid);
      if (giaAccreditata.includes(transactionIdentifier)) return null;

      const risultato = await this.riscattaForziere(tipo);

      const registrata = await this.markTransactionGrantedWithRetry(
        uid,
        transactionIdentifier,
      );

      if (!registrata) {
        console.error(
          'Transazione accreditata ma non registrata come tale:',
          transactionIdentifier,
        );
      }

      return risultato;
    })();

    this.grantsInCorso.set(transactionIdentifier, operazione);

    return operazione.finally(() => {
      this.grantsInCorso.delete(transactionIdentifier);
    });
  }

  private async getGrantedTransactionIds(uid: string): Promise<string[]> {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await this.runFirestore(() => getDoc(userRef));

    if (!snapshot.exists()) return [];

    const purchases = snapshot.data()['purchases'];
    return purchases?.grantedTransactionIds ?? [];
  }

  private async markTransactionGranted(
    uid: string,
    transactionIdentifier: string,
  ): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      updateDoc(userRef, {
        'purchases.grantedTransactionIds': arrayUnion(transactionIdentifier),
      }),
    );
  }

  // Ritenta solo la registrazione "gia' accreditato", mai il grant vero e
  // proprio: va chiamata solo DOPO che riscattaForziere() e' gia' riuscito.
  private async markTransactionGrantedWithRetry(
    uid: string,
    transactionIdentifier: string,
  ): Promise<boolean> {
    const tentativiMax = 2;

    for (let tentativo = 1; tentativo <= tentativiMax; tentativo++) {
      try {
        await this.markTransactionGranted(uid, transactionIdentifier);
        return true;
      } catch (error) {
        console.error(
          `Errore registrazione transazione accreditata (tentativo ${tentativo}/${tentativiMax}):`,
          transactionIdentifier,
          error,
        );

        if (tentativo < tentativiMax) {
          await this.wait(700);
        }
      }
    }

    return false;
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Restituisce solo gli avatar della tipologia richiesta.
  private getAvatarPerSource(source: AvatarSource): AvatarModel[] {
    return AVATARS.filter((avatar) => avatar.source === source);
  }

  // Estrae un avatar casuale tra quelli disponibili.
  private estraiAvatarCasuale(avatars: AvatarModel[]): AvatarModel {
    const index = Math.floor(Math.random() * avatars.length);
    return avatars[index];
  }
}
