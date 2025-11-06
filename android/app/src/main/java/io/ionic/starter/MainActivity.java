package io.ionic.starter;

import android.os.Bundle;
import androidx.annotation.Nullable;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import android.util.Log;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(@Nullable Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    FirebaseApp.initializeApp(this);

    try {
      GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
        .requestIdToken(getString(R.string.default_web_client_id)) // 👈 prende il client dal strings.xml
        .requestEmail()
        .build();

      GoogleSignInClient googleSignInClient = GoogleSignIn.getClient(this, gso);
      Log.d("GoogleSignIn", "✅ Google Sign-In inizializzato correttamente");
    } catch (Exception e) {
      Log.e("GoogleSignIn", "❌ Errore durante init Google Sign-In", e);
    }

    registerPlugin(FirebaseAuthenticationPlugin.class);
    Log.d("FirebaseInit", "✅ Firebase inizializzato e plugin registrato");
  }
}
