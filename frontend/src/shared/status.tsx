"use client";

import { Badge, type Tone } from "./ui/badge";
import { useLabels } from "./i18n/use-labels";
import type {
  DisputeStatus,
  IncidentPriority,
  IncidentStatus,
  PayoutStatus,
  UserStatus,
  VerificationStatus,
  VisitStatus,
} from "./types";

const VERIFICATION: Record<VerificationStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  SUSPENDED: "neutral",
};

const USER: Record<UserStatus, Tone> = { ACTIVE: "success", SUSPENDED: "warning", DEACTIVATED: "danger" };

const PRIORITY: Record<IncidentPriority, Tone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

const INCIDENT: Record<IncidentStatus, Tone> = { OPEN: "danger", IN_REVIEW: "warning", RESOLVED: "success" };
const DISPUTE: Record<DisputeStatus, Tone> = { OPEN: "warning", RESOLVED: "success" };
const PAYOUT: Record<PayoutStatus, Tone> = {
  REQUESTED: "warning",
  PROCESSING: "info",
  TRANSFERRED: "info",
  PAID: "success",
  REJECTED: "danger",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const L = useLabels();
  return (
    <Badge tone={VERIFICATION[status]} dot>
      {L.verification(status)}
    </Badge>
  );
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const L = useLabels();
  return <Badge tone={USER[status]}>{L.userStatus(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  const L = useLabels();
  return <Badge tone={PRIORITY[priority]}>{L.priority(priority)}</Badge>;
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const L = useLabels();
  return (
    <Badge tone={INCIDENT[status]} dot>
      {L.incidentStatus(status)}
    </Badge>
  );
}

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const L = useLabels();
  return (
    <Badge tone={DISPUTE[status]} dot>
      {L.dispute(status)}
    </Badge>
  );
}

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const L = useLabels();
  return (
    <Badge tone={PAYOUT[status]} dot>
      {L.payout(status)}
    </Badge>
  );
}

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  const L = useLabels();
  return (
    <Badge tone={status === "COMPLETED" ? "success" : status === "CANCELLED" || status === "DECLINED" ? "danger" : "info"}>
      {L.visitAdmin(status)}
    </Badge>
  );
}
