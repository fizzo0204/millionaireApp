import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  PurchasesError,
  PurchasesStoreTransaction,
  LOG_LEVEL,
} from '@revenuecat/purchases-capacitor';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { PURCHASES_CONFIG } from 'src/app/config/purchases.config';
import { environment } from 'src/environments/environment';

export type PurchaseOutcome =
  | { status: 'purchased'; transactionIdentifier: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

@Injectable({
  providedIn: 'root',
})
export class PurchasesService {
  private auth = inject(AuthService);

  private hasConfigured = false;
  private configuredUid: string | null = null;
  private syncPromise: Promise<void> | null = null;

  constructor() {
    if (!Capacitor.isNativePlatform()) return;

    /*
     * Configura RevenueCat all'avvio e ad ogni cambio di uid Firebase (logout,
     * eliminazione account, nuovo ospite). L'uid Firebase resta lo stesso
     * durante l'account linking (vedi AuthService.completeCurrentProfileAccountLink),
     * quindi l'identita' RevenueCat resta coerente anche in quel flusso.
     */
    this.auth.user$.subscribe((user) => {
      if (!user) return;

      this.syncIdentity(user.uid).catch((error) => {
        console.error('Errore configurazione/identita RevenueCat:', error);
      });
    });
  }

  /*
   * Acquista il prodotto (forziere) indicato tramite RevenueCat/Play Billing.
   * Ritorna un esito tipizzato invece di lanciare, cosi il chiamante puo'
   * distinguere l'annullamento dell'utente (flusso normale, nessun errore)
   * da un vero errore d'acquisto.
   */
  async purchaseProduct(productId: string): Promise<PurchaseOutcome> {
    if (!Capacitor.isNativePlatform()) {
      return {
        status: 'error',
        message: 'Gli acquisti sono disponibili solo da dispositivo.',
      };
    }

    try {
      const user = await firstValueFrom(this.auth.user$);

      if (!user) {
        return {
          status: 'error',
          message: 'Devi essere autenticato per acquistare.',
        };
      }

      await this.syncIdentity(user.uid);

      const { products } = await Purchases.getProducts({
        productIdentifiers: [productId],
        type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
      });

      const product = products[0];

      if (!product) {
        return {
          status: 'error',
          message: 'Prodotto non disponibile al momento.',
        };
      }

      const { customerInfo } = await Purchases.purchaseStoreProduct({
        product,
      });

      const transactionIdentifier = this.findLatestTransactionId(
        customerInfo.nonSubscriptionTransactions,
        productId,
      );

      if (!transactionIdentifier) {
        /*
         * Il pagamento e' comunque andato a buon fine lato store: non
         * trattarlo come annullato/non riuscito, altrimenti il chiamante
         * potrebbe far ripagare l'utente. Segnaliamo un errore esplicito cosi'
         * la UI puo' distinguere "pagato ma non tracciabile" da "non pagato".
         */
        return {
          status: 'error',
          message:
            "Pagamento riuscito ma non è stato possibile confermare la transazione. Riapri lo shop tra poco: il premio verrà assegnato automaticamente.",
        };
      }

      return { status: 'purchased', transactionIdentifier };
    } catch (error) {
      return this.mapPurchaseError(error);
    }
  }

  /*
   * Cronologia degli acquisti non-subscription noti a RevenueCat (fonte di
   * verita' per "e' stato davvero pagato"), usata per riconciliare eventuali
   * acquisti pagati ma mai accreditati su Firestore (es. l'app e' stata
   * chiusa o la scrittura e' fallita subito dopo il pagamento).
   */
  async getNonSubscriptionTransactions(): Promise<
    PurchasesStoreTransaction[]
  > {
    if (!Capacitor.isNativePlatform()) return [];

    try {
      const user = await firstValueFrom(this.auth.user$);

      if (!user) return [];

      await this.syncIdentity(user.uid);

      const { customerInfo } = await Purchases.getCustomerInfo();

      return customerInfo.nonSubscriptionTransactions;
    } catch (error) {
      console.error('Errore lettura transazioni RevenueCat:', error);
      return [];
    }
  }

  // Tra le transazioni di un prodotto, quella con la data di acquisto più recente.
  private findLatestTransactionId(
    transactions: PurchasesStoreTransaction[],
    productId: string,
  ): string | undefined {
    const delProdotto = transactions.filter(
      (transazione) => transazione.productIdentifier === productId,
    );

    if (delProdotto.length === 0) return undefined;

    const piuRecente = delProdotto.reduce((latest, current) =>
      Date.parse(current.purchaseDate) > Date.parse(latest.purchaseDate)
        ? current
        : latest,
    );

    return piuRecente.transactionIdentifier;
  }

  /*
   * Configura RevenueCat al primo utilizzo, poi mantiene l'identita' allineata
   * all'uid Firebase corrente con logIn(). Chiamate concorrenti per lo stesso
   * giro condividono la stessa promise, cosi non partono due configure()/
   * logIn() in parallelo.
   *
   * Non intercettiamo l'errore qui (a differenza di prima): se configure()/
   * logIn() fallisce, chi chiama syncIdentity() deve saperlo. purchaseProduct()
   * lo propaga come esito 'error' invece di proseguire come se l'SDK fosse
   * configurato quando non lo e' davvero; il subscribe in background nel
   * costruttore lo cattura per conto suo.
   */
  private syncIdentity(uid: string): Promise<void> {
    if (this.configuredUid === uid) return Promise.resolve();

    if (!this.syncPromise) {
      const operation = this.hasConfigured
        ? Purchases.logIn({ appUserID: uid })
        : this.configurePurchases(uid);

      this.syncPromise = operation
        .then(() => {
          this.hasConfigured = true;
          this.configuredUid = uid;
        })
        .finally(() => {
          this.syncPromise = null;
        });
    }

    return this.syncPromise;
  }

  /*
   * Livello DEBUG solo in sviluppo (per vedere in Logcat se Play Billing
   * viene davvero invocato, se i prodotti vengono trovati, ecc.); in
   * produzione resta su WARN per non scrivere nel log del device dettagli
   * delle transazioni degli utenti reali. Prima era DEBUG incondizionato,
   * lasciato attivo "temporaneamente" per diagnosticare il canale di test
   * interno e mai riportato indietro.
   */
  private async configurePurchases(uid: string): Promise<void> {
    await Purchases.setLogLevel({
      level: environment.production ? LOG_LEVEL.WARN : LOG_LEVEL.DEBUG,
    });

    await Purchases.configure({
      apiKey: PURCHASES_CONFIG.googlePlayApiKey,
      appUserID: uid,
    });
  }

  private mapPurchaseError(error: unknown): PurchaseOutcome {
    const purchasesError = error as Partial<PurchasesError> | undefined;

    if (
      purchasesError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
    ) {
      return { status: 'cancelled' };
    }

    console.error('Errore acquisto RevenueCat:', error);

    return {
      status: 'error',
      message: this.getPurchaseErrorMessage(purchasesError?.code),
    };
  }

  /*
   * purchasesError.message arriva dall'SDK RevenueCat quasi sempre in
   * inglese, incoerente con il resto dell'app (tutta in italiano). Mappiamo
   * i codici errore piu' comuni lato Google Play a un messaggio in
   * italiano, invece di mostrare il testo grezzo dell'SDK.
   */
  private getPurchaseErrorMessage(
    code: PURCHASES_ERROR_CODE | undefined,
  ): string {
    switch (code) {
      case PURCHASES_ERROR_CODE.NETWORK_ERROR:
      case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
        return 'Connessione assente o instabile. Controlla la rete e riprova.';

      case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
        return 'Pagamento in attesa di conferma da Google Play. Se va a buon fine, il premio verrà assegnato automaticamente riaprendo lo shop.';

      case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
        return 'Risulta già un acquisto in corso per questo prodotto. Riprova tra qualche istante.';

      case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
        return 'Prodotto non disponibile al momento su Google Play.';

      case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
        return "Questo account Google Play non è autorizzato ad acquistare (controlli parentali o restrizioni del dispositivo).";

      case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
        return 'Google Play non è raggiungibile in questo momento. Riprova tra poco.';

      case PURCHASES_ERROR_CODE.OPERATION_ALREADY_IN_PROGRESS_ERROR:
        return 'Un altro acquisto è già in corso. Attendi che si concluda prima di riprovare.';

      case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
      case PURCHASES_ERROR_CODE.INVALID_RECEIPT_ERROR:
      case PURCHASES_ERROR_CODE.MISSING_RECEIPT_FILE_ERROR:
        return 'Non siamo riusciti a verificare la ricevuta di Google Play. Riprova tra poco.';

      default:
        return "Errore durante l'acquisto. Riprova più tardi.";
    }
  }
}
