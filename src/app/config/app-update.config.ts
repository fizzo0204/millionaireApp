export const APP_UPDATE_CONFIG = {
  // Documento pubblico in Firestore, aggiornato manualmente da console quando
  // si vuole forzare l'update (campo minVersionCode: number).
  firestorePath: 'appConfig/android',
  playStoreUrl:
    'https://play.google.com/store/apps/details?id=com.turtlemind.app',
  // Attesa massima dello splash per sapere se serve l'update prima di
  // avviare il gioco (vedi AppComponent.initializeApp()).
  initialStatusWaitMs: 6000,
};
