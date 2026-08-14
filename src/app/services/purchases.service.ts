import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  PurchasesError,
  LOG_LEVEL,
} from '@revenuecat/purchases-capacitor';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { PURCHASES_CONFIG } from 'src/app/config/purchases.config';

export type PurchaseOutcome =
  | { status: 'purchased' }
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

      await Purchases.purchaseStoreProduct({ product });

      return { status: 'purchased' };
    } catch (error) {
      return this.mapPurchaseError(error);
    }
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
        : this.configureWithDebugLogging(uid);

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
   * TEMPORANEO per diagnosticare il flusso d'acquisto sul canale di test
   * interno: livello DEBUG per vedere in Logcat se Play Billing viene
   * davvero invocato, se i prodotti vengono trovati, ecc. Da riportare a un
   * livello meno verboso prima del rilascio pubblico.
   */
  private async configureWithDebugLogging(uid: string): Promise<void> {
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });

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
      message: purchasesError?.message ?? "Errore durante l'acquisto.",
    };
  }
}
