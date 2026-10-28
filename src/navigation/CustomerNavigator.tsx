import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useT } from '../i18n';
import { CalendarDays, CircleUser, House, MessagesSquare, Search } from '../components/icons';
import { AccountScreen } from '../screens/customer/AccountScreen';
import { AddressFormScreen } from '../screens/customer/AddressFormScreen';
import { AddressesScreen } from '../screens/customer/AddressesScreen';
import { BookScreen } from '../screens/customer/BookScreen';
import { BookingDetailScreen } from '../screens/customer/BookingDetailScreen';
import { BookingsScreen } from '../screens/customer/BookingsScreen';
import { CaregiverProfileScreen } from '../screens/customer/CaregiverProfileScreen';
import { ContactsScreen } from '../screens/customer/ContactsScreen';
import { EditProfileScreen } from '../screens/customer/EditProfileScreen';
import { DisputesScreen } from '../screens/customer/DisputesScreen';
import { FindCareScreen } from '../screens/customer/FindCareScreen';
import { HomeScreen } from '../screens/customer/HomeScreen';
import { NotificationsScreen } from '../screens/customer/NotificationsScreen';
import { PatientFormScreen } from '../screens/customer/PatientFormScreen';
import { PatientsScreen } from '../screens/customer/PatientsScreen';
import { PaymentsScreen } from '../screens/customer/PaymentsScreen';
import { VisitDetailScreen } from '../screens/customer/VisitDetailScreen';
import { ChatScreen } from '../screens/shared/chat/ChatScreen';
import { ChatMediaScreen } from '../screens/shared/chat/ChatMediaScreen';
import { ConversationsScreen } from '../screens/shared/chat/ConversationsScreen';
import { useChatUnread } from '../screens/shared/chat/common';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { useUploadsBoot } from '../lib/uploads';
import { stackOptions } from './options';
import { TabBar } from './TabBar';
import type { CustomerStack, CustomerTabs } from './types';

const Tab = createBottomTabNavigator<CustomerTabs>();
const Stack = createNativeStackNavigator<CustomerStack>();

function Tabs() {
  const t = useT('customerA.shell.nav');
  const tc = useT('mobile.chat');
  const chatUnread = useChatUnread();
  const meta = {
    Home: { label: t('home'), icon: House },
    FindCare: { label: t('findCare'), icon: Search },
    Bookings: { label: t('bookings'), icon: CalendarDays },
    Messages: { label: tc('title'), icon: MessagesSquare, badge: chatUnread },
    Account: { label: t('account'), icon: CircleUser },
  };
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={props => <TabBar {...props} meta={meta} />}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="FindCare" component={FindCareScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Messages" component={ConversationsScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export function CustomerNavigator() {
  useUploadsBoot('customer');
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="CustomerTabs" component={Tabs} />
      <Stack.Screen name="CaregiverProfile" component={CaregiverProfileScreen} />
      <Stack.Screen name="Book" component={BookScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="VisitDetail" component={VisitDetailScreen} />
      <Stack.Screen name="Patients" component={PatientsScreen} />
      <Stack.Screen name="PatientForm" component={PatientFormScreen} />
      <Stack.Screen name="Addresses" component={AddressesScreen} />
      <Stack.Screen name="AddressForm" component={AddressFormScreen} />
      <Stack.Screen name="Contacts" component={ContactsScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="Disputes" component={DisputesScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChatMedia" component={ChatMediaScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}
