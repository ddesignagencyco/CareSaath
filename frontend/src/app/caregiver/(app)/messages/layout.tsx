import type { ReactNode } from "react";
import { CaregiverMessages } from "./messages-client";

// The conversation list is fetched on the client, so navigations into the chat
// subtree are not instant — opt it out of instant-navigation validation.
export const instant = false;

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <CaregiverMessages>{children}</CaregiverMessages>;
}
