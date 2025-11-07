import { bootstrapApplication } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app-routes';

// ✅ IMPORTA TUTTI I LOADER
import { defineCustomElements as ionicElements } from '@ionic/core/loader';
import { defineCustomElements as pwaElements } from '@ionic/pwa-elements/loader';

// 👇 REGISTRA I WEB COMPONENTS PRIMA DEL BOOTSTRAP
ionicElements(window);
pwaElements(window);

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({
      mode: 'md',
      animated: true,
    }),
    provideRouter(routes),
  ],
})
  .then(() => {
    console.log('✅ Angular + Ionic bootstrap completato');
    console.log('🧩 Ionic components definiti correttamente');
  })
  .catch((err) => console.error('❌ Errore Bootstrap:', err));
