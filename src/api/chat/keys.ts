import type { ChatScope } from "./types";

/** Query keys; `root` invalidates every chat list of a side. */
export const chatKeys = {
  root: (scope: ChatScope) => [`${scope}-chat`] as const,
  conversations: (scope: ChatScope) => [`${scope}-chat`, "conversations"] as const,
  conversation: (scope: ChatScope, id: string) => [`${scope}-chat`, "conversation", id] as const,
  messages: (scope: ChatScope, id: string) => [`${scope}-chat`, "messages", id] as const,
};
