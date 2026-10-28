package com.carenative

import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * react-native-screens: discard saved fragment state so a process restore
   * does not try to rebuild screens that React no longer knows about.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    syncNavigationBar(resources.configuration)
  }

  /** Dark mode is switched in-app (uiMode is handled here, no restart). */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    syncNavigationBar(newConfig)
  }

  /**
   * Edge-to-edge: no white scrim behind 3-button navigation, so the app's own
   * (light or dark) tab bar shows through, with button icons to match.
   */
  private fun syncNavigationBar(config: Configuration) {
    // The in-app Light/Dark choice (Appearance.setColorScheme) wins over the phone.
    val night = when (AppCompatDelegate.getDefaultNightMode()) {
      AppCompatDelegate.MODE_NIGHT_YES -> true
      AppCompatDelegate.MODE_NIGHT_NO -> false
      else -> (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.isNavigationBarContrastEnforced = false
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = !night
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "careNative"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
