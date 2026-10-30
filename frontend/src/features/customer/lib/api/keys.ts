/** Query-key roots, so a mutation can invalidate every list of a resource. */
export const keys = {
  me: ["c-me"] as const,
  patients: ["c-patients"] as const,
  addresses: ["c-addresses"] as const,
  contacts: ["c-contacts"] as const,
  caregivers: ["c-caregivers"] as const,
  bookings: ["c-bookings"] as const,
  visit: ["c-visit"] as const,
  payments: ["c-payments"] as const,
  disputes: ["c-disputes"] as const,
  notifications: ["c-notifications"] as const,
};
