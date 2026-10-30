import type { ReactNode } from "react";
import { CustomerMessages } from "./messages-client";

// The conversation list is fetched on the client, so navigations into the chat
// subtree are not instant — opt it out of instant-navigation validation.
export const instant = false;

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <CustomerMessages>{children}</CustomerMessages>;
}
