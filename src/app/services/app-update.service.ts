import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  of,
  shareReplay,
  take,
  timeout,
} from 'rxjs';
import { APP_UPDATE_CONFIG } from 'src/app/config/app-update.config';

interface AppUpdateRemoteConfig {
  minVersionCode?: number;
}

/*
 * undefined = non ancora noto (lettura in corso), null = noto ma assente
 * (nessun vincolo, piattaforma web, errore di lettura). La distinzione serve
 * a waitForInitialStatus(): lo splash aspetta che entrambi i valori siano
 * noti, non solo che l'update risulti "non richiesto" per mancanza di dati.
 */
type VersionCodeState = number | null | undefined;

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  private minVersionCodeSubject = new BehaviorSubject<VersionCodeState>(
    undefined,
  );
  private currentVersionCodeSubject = new BehaviorSubject<VersionCodeState>(
    undefined,
  );

  // Vero solo quando conosciamo sia la versione minima richiesta sia quella
  // installata, e quest'ultima e' inferiore: finche' uno dei due manca (rete
  // lenta, piattaforma web) non blocchiamo nulla.
  readonly updateRequired$ = combineLatest([
    this.minVersionCodeSubject.asObservable(),
    this.currentVersionCodeSubject.asObservable(),
  ]).pipe(
    map(([minVersionCode, currentVersionCode]) =>
      this.computeUpdateRequired(minVersionCode, currentVersionCode),
    ),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  constructor() {
    this.listenToMinVersionCode();
    void this.loadCurrentVersionCode();
  }

  // Lettura sincrona, per le guardie dei flussi che aprono modali in automatico.
  isUpdateRequired(): boolean {
    return this.computeUpdateRequired(
      this.minVersionCodeSubject.value,
      this.currentVersionCodeSubject.value,
    );
  }

  /*
   * Usata dallo splash iniziale: risolve quando sappiamo se serve un
   * aggiornamento (entrambe le versioni note), cosi' l'app non parte nemmeno
   * per un istante se e' obsoleta. Il tetto evita di restare bloccati sullo
   * splash se Firestore non risponde (es. offline senza cache).
   */
  waitForInitialStatus(maxWaitMs: number): Promise<void> {
    return firstValueFrom(
      combineLatest([
        this.minVersionCodeSubject.asObservable(),
        this.currentVersionCodeSubject.asObservable(),
      ]).pipe(
        filter(
          ([minVersionCode, currentVersionCode]) =>
            minVersionCode !== undefined && currentVersionCode !== undefined,
        ),
        take(1),
        timeout({ first: maxWaitMs, with: () => of(null) }),
        catchError(() => of(null)),
        map(() => undefined),
      ),
    );
  }

  openStoreListing(): void {
    window.open(APP_UPDATE_CONFIG.playStoreUrl, '_system');
  }

  private computeUpdateRequired(
    minVersionCode: VersionCodeState,
    currentVersionCode: VersionCodeState,
  ): boolean {
    return (
      typeof minVersionCode === 'number' &&
      typeof currentVersionCode === 'number' &&
      currentVersionCode < minVersionCode
    );
  }

  private listenToMinVersionCode(): void {
    if (!Capacitor.isNativePlatform()) {
      this.minVersionCodeSubject.next(null);
      return;
    }

    const configRef = doc(this.firestore, APP_UPDATE_CONFIG.firestorePath);

    this.runFirestore(() => docData(configRef))
      .pipe(
        catchError((error) => {
          console.error('Errore lettura versione minima app:', error);
          return of(undefined);
        }),
      )
      .subscribe((config) => {
        const remoteConfig = config as AppUpdateRemoteConfig | undefined;

        this.minVersionCodeSubject.next(
          typeof remoteConfig?.minVersionCode === 'number'
            ? remoteConfig.minVersionCode
            : null,
        );
      });
  }

  private async loadCurrentVersionCode(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.currentVersionCodeSubject.next(null);
      return;
    }

    try {
      const info = await App.getInfo();
      const versionCode = parseInt(info.build, 10);

      this.currentVersionCodeSubject.next(
        Number.isNaN(versionCode) ? null : versionCode,
      );
    } catch (error) {
      console.error('Errore lettura versione app corrente:', error);
      this.currentVersionCodeSubject.next(null);
    }
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
