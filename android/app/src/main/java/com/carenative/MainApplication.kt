package com.carenative

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    loadReactNative(this)
  }

  /**
   * Push notifications from the backend (FCM) target this channel; firebase.json
   * also makes it FCM's default. Creating an existing channel is a no-op, and the
   * user can still change its sound or importance in system settings.
   */
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      "caresaath-default",
      "CareSaath alerts",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply { description = "Bookings, visits, messages and safety alerts" }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }
}
