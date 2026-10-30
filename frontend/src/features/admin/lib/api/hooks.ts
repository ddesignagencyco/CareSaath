"use client";

export { useAction } from "@shared/api/use-action";

/** Query-key roots, so a mutation can invalidate every list of a resource. */
export const keys = {
  caregivers: ["a-caregivers"] as const,
  analytics: ["a-analytics"] as const,
  incidents: ["a-incidents"] as const,
  disputes: ["a-disputes"] as const,
  payouts: ["a-payouts"] as const,
  commissions: ["a-commissions"] as const,
  promos: ["a-promos"] as const,
  config: ["a-config"] as const,
};
