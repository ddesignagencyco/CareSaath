import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { CalendarDays, ClipboardList, Ellipsis, House, MessagesSquare } from '../components/icons';
import { AvailabilityScreen } from '../screens/caregiver/AvailabilityScreen';
import { CgNotificationsScreen } from '../screens/caregiver/CgNotificationsScreen';
import { CgProfileScreen } from '../screens/caregiver/CgProfileScreen';
import { CgVisitDetailScreen } from '../screens/caregiver/CgVisitDetailScreen';
import { EarningsScreen } from '../screens/caregiver/EarningsScreen';
import { MoreScreen } from '../screens/caregiver/MoreScreen';
import { OnboardingScreen } from '../screens/caregiver/OnboardingScreen';
import { ReportsScreen } from '../screens/caregiver/ReportsScreen';
import { RequestsScreen } from '../screens/caregiver/RequestsScreen';
import { StatusScreen } from '../screens/caregiver/StatusScreen';
import { TodayScreen } from '../screens/caregiver/TodayScreen';
import { VisitsScreen } from '../screens/caregiver/VisitsScreen';
import { ChatScreen } from '../screens/shared/chat/ChatScreen';
import { ChatMediaScreen } from '../screens/shared/chat/ChatMediaScreen';
import { ConversationsScreen } from '../screens/shared/chat/ConversationsScreen';
import { useChatUnread } from '../screens/shared/chat/common';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { useUploadsBoot } from '../lib/uploads';
import { stackOptions } from './options';
import { TabBar } from './TabBar';
import type { CaregiverSetupStack, CaregiverStack, CaregiverTabs } from './types';

const Tab = createBottomTabNavigator<CaregiverTabs>();
const Stack = createNativeStackNavigator<CaregiverStack>();
const Setup = createNativeStackNavigator<CaregiverSetupStack>();

function Tabs() {
  const t = useT('caregiverA.nav');
  const tn = useT('customerA.shell.nav');
  const tc = useT('mobile.chat');
  const chatUnread = useChatUnread();
  const meta = {
    Today: { label: tn('home'), icon: House },
    Requests: { label: t('requests'), icon: ClipboardList },
    Visits: { label: t('visits'), icon: CalendarDays },
    Messages: { label: tc('title'), icon: MessagesSquare, badge: chatUnread },
    More: { label: t('more'), icon: Ellipsis },
  };
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={props => <TabBar {...props} meta={meta} />}>
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Requests" component={RequestsScreen} />
      <Tab.Screen name="Visits" component={VisitsScreen} />
      <Tab.Screen name="Messages" component={ConversationsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

/** FR-CG2: no unverified caregiver reaches the working app. */
export function CaregiverNavigator() {
  const { caregiverStage } = useAuth();
  useUploadsBoot('caregiver');
  if (caregiverStage !== 'approved') {
    return (
      <Setup.Navigator screenOptions={stackOptions} initialRouteName={caregiverStage === 'onboarding' ? 'Onboarding' : 'Status'}>
        {caregiverStage === 'onboarding' ? <Setup.Screen name="Onboarding" component={OnboardingScreen} /> : <Setup.Screen name="Status" component={StatusScreen} />}
        <Setup.Screen name="Settings" component={SettingsScreen} />
      </Setup.Navigator>
    );
  }
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="CaregiverTabs" component={Tabs} />
      <Stack.Screen name="CgVisitDetail" component={CgVisitDetailScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="Availability" component={AvailabilityScreen} />
      <Stack.Screen name="CgProfile" component={CgProfileScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="CgNotifications" component={CgNotificationsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChatMedia" component={ChatMediaScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}
