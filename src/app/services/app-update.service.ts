import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { APP_UPDATE_CONFIG } from 'src/app/config/app-update.config';

interface AppUpdateRemoteConfig {
  minVersionCode?: number;
}

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  private minVersionCodeSubject = new BehaviorSubject<number | null>(null);
  private currentVersionCodeSubject = new BehaviorSubject<number | null>(
    null,
  );

  // Vero solo quando conosciamo sia la versione minima richiesta sia quella
  // installata, e quest'ultima e' inferiore: finche' uno dei due manca (rete
  // lenta, piattaforma web) non blocchiamo nulla.
  readonly updateRequired$ = combineLatest([
    this.minVersionCodeSubject.asObservable(),
    this.currentVersionCodeSubject.asObservable(),
  ]).pipe(
    map(
      ([minVersionCode, currentVersionCode]) =>
        minVersionCode !== null &&
        currentVersionCode !== null &&
        currentVersionCode < minVersionCode,
    ),
  );

  constructor() {
    this.listenToMinVersionCode();
    void this.loadCurrentVersionCode();
  }

  openStoreListing(): void {
    window.open(APP_UPDATE_CONFIG.playStoreUrl, '_system');
  }

  private listenToMinVersionCode(): void {
    if (!Capacitor.isNativePlatform()) return;

    const configRef = doc(this.firestore, APP_UPDATE_CONFIG.firestorePath);

    this.runFirestore(() => docData(configRef)).subscribe((config) => {
      const remoteConfig = config as AppUpdateRemoteConfig | undefined;

      this.minVersionCodeSubject.next(
        typeof remoteConfig?.minVersionCode === 'number'
          ? remoteConfig.minVersionCode
          : null,
      );
    });
  }

  private async loadCurrentVersionCode(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const info = await App.getInfo();
      const versionCode = parseInt(info.build, 10);

      if (!Number.isNaN(versionCode)) {
        this.currentVersionCodeSubject.next(versionCode);
      }
    } catch (error) {
      console.error('Errore lettura versione app corrente:', error);
    }
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
