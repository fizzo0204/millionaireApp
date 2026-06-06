import { bootstrapApplication } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideRouter } from '@angular/router';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { LogLevel, setLogLevel } from '@angular/fire';

import { AppComponent } from './app/app.component';
import { routes } from './app/app-routes';
import { environment } from './environments/environment';

import { addIcons } from 'ionicons';
import {
  homeOutline,
  trophyOutline,
  cartOutline,
  settingsOutline,
  chevronForwardOutline,
  logOutOutline,
  createOutline,
  checkmarkCircle,
  closeOutline,
  arrowBackOutline,
  lockClosedOutline,
  logoFacebook,
  logoGoogle,
  flash,
  gift,
  personOutline,
  lockClosed,
  refreshOutline,
  trashOutline,
  cloudDoneOutline,
  play,
  gameControllerOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { defineCustomElements as ionicElements } from '@ionic/core/loader';
import { defineCustomElements as pwaElements } from '@ionic/pwa-elements/loader';

ionicElements(window);
pwaElements(window);
setLogLevel(LogLevel.SILENT);

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({
      mode: 'md',
      animated: true,
    }),
    provideRouter(routes),

    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
  ],
})
  .then(() => {
    console.log('✅ Angular + Ionic bootstrap completato');
    console.log('🔥 Firebase + Firestore configurati');
  })
  .catch((err) => console.error('❌ Errore Bootstrap:', err));

addIcons({
  'home-outline': homeOutline,
  'trophy-outline': trophyOutline,
  'cart-outline': cartOutline,
  'settings-outline': settingsOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'log-out-outline': logOutOutline,
  'create-outline': createOutline,
  'checkmark-circle': checkmarkCircle,
  'close-outline': closeOutline,
  'arrow-back-outline': arrowBackOutline,
  'lock-closed-outline': lockClosedOutline,
  'logo-facebook': logoFacebook,
  'logo-google': logoGoogle,
  flash: flash,
  gift: gift,
  'person-outline': personOutline,
  'lock-closed': lockClosed,
  'refresh-outline': refreshOutline,
  'trash-outline': trashOutline,
  'cloud-done-outline': cloudDoneOutline,
  play: play,
  'game-controller-outline': gameControllerOutline,
  'sparkles-outline': sparklesOutline,
});
