# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Nota: i plugin Capacitor (incluso il bridge com.getcapacitor.Plugin/@PluginMethod
# usato da tutti i plugin, e quindi anche da @capacitor-community/admob e
# @capacitor-firebase/authentication) sono gia protetti automaticamente dalle
# consumer proguard rules del modulo capacitor-android, non serve ripeterle qui.

# Attributi necessari per riflessione/generici usati dagli SDK sotto.
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod

# Firebase Authentication (com.google.firebase.auth.PlayGamesAuthProvider incluso:
# Play Games riusa le classi di Google Sign-In, non ha un SDK nativo separato).
-keep class com.google.firebase.auth.** { *; }

# Google Sign-In / Credential Manager (usati sia per il login Google sia per Play Games).
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.api.** { *; }
-keep class androidx.credentials.** { *; }

# Facebook Login SDK.
-keep class com.facebook.** { *; }
-dontwarn com.facebook.**

# Google Mobile Ads (AdMob) e User Messaging Platform (consenso GDPR/UMP).
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-dontwarn com.google.android.gms.ads.**
-dontwarn com.google.android.ump.**
