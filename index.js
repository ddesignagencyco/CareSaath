/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Headless FCM handler for background / quit-state messages — must be registered
// outside the React tree. Notification-payload messages are shown by the OS; a
// data-only message could do work here. Kept a no-op for now.
setBackgroundMessageHandler(getMessaging(), async () => {});

AppRegistry.registerComponent(appName, () => App);
