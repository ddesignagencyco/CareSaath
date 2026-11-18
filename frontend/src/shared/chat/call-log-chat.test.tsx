import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ChatProvider, useChatContext } from "./context";
import { ChatThread } from "./chat";
import { mergeChatItems, toChatMessage } from "./use-chat-backend";
import type { BackendChatMessage, ChatTransport } from "./types";

// jsdom does not implement scrollIntoView (the thread scrolls to the newest item).
Element.prototype.scrollIntoView = vi.fn();

const ME = "00000000-0000-0000-0000-000000000001";
const PEER = "00000000-0000-0000-0000-000000000002";

function row(overrides: Partial<BackendChatMessage> & { id: string; createdAt: string }): BackendChatMessage {
  return {
    bookingId: "b-1",
    senderId: PEER,
    type: "TEXT",
    body: "hello",
    url: null,
    mimeType: null,
    sizeBytes: null,
    replyToId: null,
    reactions: [],
    readAt: null,
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

/** The shape returned by GET /chat/conversations/:id/messages for a virtual CALL row. */
function callRow(overrides: Partial<BackendChatMessage> = {}): BackendChatMessage {
  return row({
    id: "call-c1",
    type: "CALL",
    body: null,
    senderId: PEER,
    callId: "c1",
    callStatus: "MISSED",
    durationSec: null,
    createdAt: "2026-11-18T10:01:00.000Z",
    ...overrides,
  });
}

function transport(items: BackendChatMessage[], myUserId = ME): ChatTransport {
  return {
    myUserId,
    threads: [{ id: PEER, name: "Nurse", role: "", activeBookingId: "b-1", bookingIds: ["b-1"], peerUserId: PEER }],
    threadsLoaded: true,
    listMessages: vi.fn().mockResolvedValue(items),
    send: vi.fn().mockResolvedValue({} as BackendChatMessage),
    markRead: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn().mockResolvedValue({} as BackendChatMessage),
    react: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function Harness() {
  const { conversations } = useChatContext();
  return (
    <ChatThread
      conversation={conversations[0]!}
      onSend={vi.fn()}
      onReact={vi.fn()}
      onDelete={vi.fn()}
      onUploadComplete={vi.fn()}
    />
  );
}

async function renderThread(items: BackendChatMessage[], myUserId = ME, readyText = "before") {
  const result = renderWithProviders(
    <ChatProvider scope="customer" transport={transport(items, myUserId)}>
      <Harness />
    </ChatProvider>,
  );
  await waitFor(() => expect(screen.getByText(readyText)).toBeTruthy());
  return result;
}

describe("call-log mapping (live API data only)", () => {
  it("maps a CALL row using the caller id, status and duration from the API", () => {
    const mapped = toChatMessage(callRow({ callStatus: "ENDED", durationSec: 125 }), ME);
    expect(mapped).toMatchObject({
      id: "call-c1",
      type: "call",
      sender: "them",
      readByThem: true,
      call: { callId: "c1", status: "ENDED", durationSec: 125 },
      createdAt: new Date("2026-11-18T10:01:00.000Z").getTime(),
    });
    // Nothing is fabricated for a system item.
    expect(mapped.text).toBeUndefined();
    expect(mapped.mediaUrl).toBeUndefined();
    expect(mapped.deleted).toBe(false);
  });

  it("attributes an outgoing call to the caller", () => {
    const mapped = toChatMessage(callRow({ senderId: ME }), ME);
    expect(mapped.sender).toBe("me");
  });

  it("de-duplicates by row id and orders oldest-first", () => {
    const items = [
      callRow({ id: "call-c1", createdAt: "2026-11-18T10:05:00.000Z" }),
      row({ id: "m-1", createdAt: "2026-11-18T10:01:00.000Z" }),
      callRow({ id: "call-c1", createdAt: "2026-11-18T10:05:00.000Z" }), // same row from a repeated page
      row({ id: "m-2", createdAt: "2026-11-18T10:09:00.000Z" }),
    ];
    const merged = mergeChatItems(items, ME, PEER);
    expect(merged.map((m) => m.id)).toEqual(["m-1", "call-c1", "m-2"]);
    expect(merged.every((m) => m.conversationId === PEER)).toBe(true);
  });
});

describe("call-log entries in the web chat thread", () => {
  it("renders a missed incoming call between messages, exactly once", async () => {
    const items = [
      row({ id: "m-1", body: "before", createdAt: "2026-11-18T10:00:00.000Z" }),
      callRow({ callStatus: "MISSED" }),
      callRow({ callStatus: "MISSED" }), // duplicated API row must not render twice
      row({ id: "m-2", body: "after", createdAt: "2026-11-18T10:02:00.000Z" }),
    ];
    await renderThread(items);

    expect(screen.getAllByText("Missed call")).toHaveLength(1);
    expect(screen.getByText("Missed call").closest("span.inline-flex")).toHaveClass("text-danger-700");
    // Timeline order is preserved: text → call → text.
    expect(screen.getByText("before").compareDocumentPosition(screen.getByText("Missed call")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Missed call").compareDocumentPosition(screen.getByText("after")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders an outgoing call for the caller", async () => {
    await renderThread([callRow({ senderId: ME, callStatus: "INITIATED" })], ME, "Outgoing call");
    expect(screen.getByText("Outgoing call")).toBeTruthy();
  });

  it("renders a declined call with the declined label and danger styling", async () => {
    await renderThread([callRow({ callStatus: "REJECTED" })], ME, "Declined call");
    const label = screen.getByText("Declined call");
    expect(label).toBeTruthy();
    expect(label.closest("span.inline-flex")).toHaveClass("text-danger-700");
  });

  it("shows the duration of a connected call", async () => {
    await renderThread([callRow({ callStatus: "ENDED", durationSec: 125 })], ME, "Incoming call");
    expect(screen.getByText("Incoming call")).toBeTruthy();
    expect(screen.getByText("· 02:05")).toBeTruthy();
  });
});
