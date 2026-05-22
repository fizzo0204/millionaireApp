package com.turtlemind.app;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

import io.capawesome.capacitorjs.plugins.firebase.app.FirebaseAppPlugin;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    try {
      // ✅ 1. Inizializza Firebase nativo
      FirebaseApp.initializeApp(this);
      Log.d("FirebaseInit", "🔥 Firebase inizializzato correttamente");

      // ✅ 2. Registra i plugin necessari
      registerPlugin(FirebaseAppPlugin.class);
      registerPlugin(FirebaseAuthenticationPlugin.class);
      Log.d("FirebaseInit", "✅ Plugin FirebaseApp & FirebaseAuth registrati");

    } catch (Exception e) {
      Log.e("FirebaseInit", "❌ Errore durante init Firebase", e);
    }
  }
}
