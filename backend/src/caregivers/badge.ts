export type CaregiverBadge = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface BadgeInputs {
  experienceYears: number | null;
  /** Prisma returns this as a Decimal; accept anything Number() can coerce. */
  ratingAverage: number | string | { toString(): string };
  ratingCount: number;
  completedVisits: number;
}

/**
 * Ranking tier from years of experience, rating, and completed-visit volume.
 * Purely computed (never stored) so it can never go stale against a review
 * or a newly completed visit.
 */
export function computeCaregiverBadge(input: BadgeInputs): CaregiverBadge {
  const experienceYears = input.experienceYears ?? 0;
  const ratingAverage = Number(input.ratingAverage);

  if (
    experienceYears >= 5 &&
    input.ratingCount >= 20 &&
    ratingAverage >= 4.5 &&
    input.completedVisits >= 100
  ) {
    return 'PLATINUM';
  }
  if (
    experienceYears >= 3 &&
    input.ratingCount >= 10 &&
    ratingAverage >= 4.0 &&
    input.completedVisits >= 50
  ) {
    return 'GOLD';
  }
  if (
    experienceYears >= 1 &&
    input.ratingCount >= 1 &&
    ratingAverage >= 3.5 &&
    input.completedVisits >= 10
  ) {
    return 'SILVER';
  }
  return 'BRONZE';
}
