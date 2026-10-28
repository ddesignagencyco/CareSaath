import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppRole } from '../auth/AuthContext';
import type { Specialty } from '../api/types';

/* Route names double as the deep-link structure later (caresaath://customer/visit/:id). */

export type AuthStack = {
  Intro: undefined;
  Welcome: undefined;
  /**
   * The account's role comes from the number (the token). `intent` only
   * matters for a new number: "caregiver" starts caregiver onboarding.
   */
  Login: { intent?: AppRole } | undefined;
};

export type CustomerTabs = {
  Home: undefined;
  FindCare: { specialty?: Specialty } | undefined;
  Bookings: undefined;
  Messages: undefined;
  Account: undefined;
};

/** In-app chat, mounted in both signed-in stacks. */
export type ChatRoutes = {
  Chat: { id: string; name: string };
  /** Shared photos, videos and documents of one conversation. */
  ChatMedia: { id: string; name: string };
};

export type CustomerStack = ChatRoutes & {
  CustomerTabs: NavigatorScreenParams<CustomerTabs>;
  CaregiverProfile: { id: string };
  Book: { caregiverId: string };
  BookingDetail: { id: string };
  VisitDetail: { id: string };
  Patients: undefined;
  PatientForm: { id?: string } | undefined;
  Addresses: undefined;
  AddressForm: { id?: string } | undefined;
  Contacts: undefined;
  Payments: undefined;
  Disputes: undefined;
  Notifications: undefined;
  EditProfile: undefined;
  Settings: undefined;
};

export type CaregiverTabs = {
  Today: undefined;
  Requests: undefined;
  Visits: undefined;
  Messages: undefined;
  More: undefined;
};

export type CaregiverStack = ChatRoutes & {
  CaregiverTabs: NavigatorScreenParams<CaregiverTabs>;
  CgVisitDetail: { id: string };
  Earnings: undefined;
  Availability: undefined;
  CgProfile: undefined;
  Reports: undefined;
  CgNotifications: undefined;
  Settings: undefined;
};

/** Before approval a caregiver only sees these. */
export type CaregiverSetupStack = {
  Onboarding: undefined;
  Status: undefined;
  Settings: undefined;
};

export type AuthScreen<K extends keyof AuthStack> = NativeStackScreenProps<AuthStack, K>;
export type CustomerScreen<K extends keyof CustomerStack> = NativeStackScreenProps<CustomerStack, K>;
export type CaregiverScreen<K extends keyof CaregiverStack> = NativeStackScreenProps<CaregiverStack, K>;
export type CaregiverSetupScreen<K extends keyof CaregiverSetupStack> = NativeStackScreenProps<CaregiverSetupStack, K>;
