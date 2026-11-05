# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Native modules looked up by name from JS/C++ (R8 can't see those uses).
-keep class com.margelo.nitro.** { *; }
-keep class com.ReactNativeBlobUtil.** { *; }
-keep class com.reactnativecommunity.clipboard.** { *; }
-keep class com.reactnativecommunity.cameraroll.** { *; }
-keep class com.brentvatne.** { *; }
-keep class com.reactnativecommunity.geolocation.** { *; }
-keep class com.imagepicker.** { *; }
-keep class com.reactnativedocumentpicker.** { *; }
-dontwarn com.facebook.react.**

# react-native-webrtc: its native code calls back into these Java classes by
# name, and React Native reads the module's @ReactMethod annotations at runtime,
# so neither may be renamed or stripped by R8.
-keep class com.oney.WebRTCModule.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
-keepattributes *Annotation*
