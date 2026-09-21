package com.turtlemind.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

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

    try {
      // L'app ha un solo tema (scuro): disabilitiamo lo "scurimento
      // algoritmico" del WebView, che su alcuni device/OEM puo' ridipingere
      // il testo ignorando i colori CSS espliciti della pagina.
      WebView webView = getBridge().getWebView();

      if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
        WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.getSettings(), false);
        Log.d("ThemeInit", "🌙 Scurimento algoritmico WebView disabilitato");
      }
    } catch (Exception e) {
      Log.e("ThemeInit", "❌ Errore disabilitazione scurimento automatico WebView", e);
    }
  }
}
