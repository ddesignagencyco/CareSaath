/** Query-key roots, so a mutation can invalidate every list of a resource. */
export const keys = {
  me: ["cg-me"] as const,
  profile: ["cg-profile"] as const,
  availability: ["cg-availability"] as const,
  serviceAreas: ["cg-service-areas"] as const,
  bookings: ["cg-bookings"] as const,
  visits: ["cg-visits"] as const,
  earnings: ["cg-earnings"] as const,
  payouts: ["cg-payouts"] as const,
  accounts: ["cg-payout-accounts"] as const,
  safety: ["cg-safety-reports"] as const,
  disputes: ["cg-disputes"] as const,
  notifications: ["cg-notifications"] as const,
};
