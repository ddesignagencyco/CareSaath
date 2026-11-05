import { act, fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, json, mockFetch } from "@/test/utils";
import { createSessionStore } from "@shared/api/session";
import { CallProvider, useCallOptional } from "./call-context";

/* ---------------- socket.io-client fake ---------------- */

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  handlers = new Map<string, Handler[]>();
  emitted: { event: string; payload: unknown }[] = [];
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  disconnect() {
    return this;
  }
  /** Deliver a server → client event. */
  serve(event: string, payload?: unknown) {
    for (const fn of this.handlers.get(event) ?? []) fn(payload);
  }
  sent(event: string) {
    return this.emitted.filter((e) => e.event === event);
  }
}

const sockets: FakeSocket[] = [];
vi.mock("socket.io-client", () => ({
  io: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  },
}));

/* ---------------- Audio fake ---------------- */

class FakeAudio {
  static instances: FakeAudio[] = [];
  static blockAutoplay = false;
  src: string;
  loop = false;
  paused = true;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play() {
    if (FakeAudio.blockAutoplay) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  load() {}
}

const playing = () => FakeAudio.instances.filter((a) => !a.paused);

/* ---------------- WebRTC / media fakes (only what the caller path touches) ---------------- */

class FakePeer {
  onicecandidate: unknown = null;
  ontrack: unknown = null;
  onconnectionstatechange: unknown = null;
  oniceconnectionstatechange: unknown = null;
  connectionState = "new";
  iceConnectionState = "new";
  addTrack() {}
  getSenders() {
    return [];
  }
  close() {}
  async createOffer() {
    return { type: "offer", sdp: "v=0" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "v=0" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
}

const fakeStream = { getTracks: () => [], getAudioTracks: () => [] };

let api: ReturnType<typeof useCallOptional> = null;
function Probe() {
  const call = useCallOptional();
  useEffect(() => {
    api = call;
  });
  return null;
}

function renderProvider() {
  const session = createSessionStore("caresaath.test.call");
  session.set({ phone: "+923001234567" });
  renderWithProviders(
    <CallProvider session={session} enabled>
      <Probe />
    </CallProvider>,
  );
  const socket = sockets[sockets.length - 1];
  if (!socket) throw new Error("no socket created");
  return socket;
}

async function startOutgoing(socket: FakeSocket) {
  await act(async () => {
    api?.startCall({ visitId: "v1", peerName: "Ayesha", video: false });
  });
  expect(socket.sent("call:invite")).toHaveLength(1);
}

beforeEach(() => {
  sockets.length = 0;
  FakeAudio.instances = [];
  FakeAudio.blockAutoplay = false;
  api = null;
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  vi.stubGlobal("RTCSessionDescription", class { constructor(init: unknown) { Object.assign(this, init); } });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => fakeStream) },
  });
  mockFetch(() => json({ iceServers: [] }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CallProvider ringing", () => {
  it("asks the server for a still-ringing call on every (re)connect", () => {
    const socket = renderProvider();
    expect(socket.sent("call:sync")).toHaveLength(0);
    act(() => socket.serve("connect"));
    act(() => socket.serve("connect")); // reconnect
    expect(socket.sent("call:sync")).toHaveLength(2);
  });

  it("caller: shows Ringing… with a looping ringback after call:outgoing, and No answer on call:missed", async () => {
    const socket = renderProvider();
    await startOutgoing(socket);
    expect(screen.getByText("Calling…")).toBeInTheDocument();
    expect(playing()).toHaveLength(0); // nothing until the server confirms the invite

    act(() => socket.serve("call:outgoing", { callId: "c1", calleeOnline: true, ringSeconds: 30 }));
    expect(screen.getByText("Ringing…")).toBeInTheDocument();
    expect(playing()).toHaveLength(1);
    expect(playing()[0]).toMatchObject({ src: "/sounds/ringback.wav", loop: true });

    act(() => socket.serve("call:missed", { callId: "c1" }));
    expect(await screen.findByText("No answer")).toBeInTheDocument();
    expect(screen.queryByText("Ringing…")).not.toBeInTheDocument();
    expect(playing()).toHaveLength(0);
    expect(FakeAudio.instances[0].src).toBe(""); // released
  });

  it("caller: says the callee was notified when they were offline", async () => {
    const socket = renderProvider();
    await startOutgoing(socket);
    act(() => socket.serve("call:outgoing", { callId: "c1", calleeOnline: false, ringSeconds: 30 }));
    expect(screen.getByText("Calling…")).toBeInTheDocument();
    expect(playing()).toHaveLength(1);
    act(() => socket.serve("call:missed", { callId: "c1" }));
    expect(await screen.findByText("No answer. They’ve been notified.")).toBeInTheDocument();
    expect(playing()).toHaveLength(0);
  });

  it("caller: tears down after ringSeconds + 5s if no terminal event arrives", async () => {
    const socket = renderProvider();
    await startOutgoing(socket);
    vi.useFakeTimers();
    act(() => socket.serve("call:outgoing", { callId: "c1", calleeOnline: true, ringSeconds: 30 }));
    act(() => vi.advanceTimersByTime(34_000));
    expect(screen.getByText("Ringing…")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.queryByText("Ringing…")).not.toBeInTheDocument();
    expect(socket.sent("call:end")).toEqual([{ event: "call:end", payload: { callId: "c1" } }]);
    expect(playing()).toHaveLength(0);
  });

  it("caller: hanging up while ringing ends the call and stops the ringback", async () => {
    const socket = renderProvider();
    await startOutgoing(socket);
    act(() => socket.serve("call:outgoing", { callId: "c1", calleeOnline: true, ringSeconds: 30 }));
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    expect(socket.sent("call:end")).toEqual([{ event: "call:end", payload: { callId: "c1" } }]);
    expect(playing()).toHaveLength(0);
  });

  it("caller: shows call:error messages", async () => {
    const socket = renderProvider();
    await startOutgoing(socket);
    act(() => socket.serve("call:error", { message: "No active visit with this person" }));
    expect(await screen.findByText("No active visit with this person")).toBeInTheDocument();
    expect(screen.queryByText("Calling…")).not.toBeInTheDocument();
  });

  it("callee: loops the ringtone while an incoming call shows, and dismisses on call:ended", () => {
    const socket = renderProvider();
    act(() => socket.serve("call:incoming", { callId: "c2", visitId: "v1", callerId: "u1", callerName: "Bilal", sdp: { type: "offer", sdp: "v=0" } }));
    expect(screen.getByText("Incoming call")).toBeInTheDocument();
    expect(playing()).toHaveLength(1);
    expect(playing()[0]).toMatchObject({ src: "/sounds/ringtone.wav", loop: true });

    // A call:sync reply for the same call must not reject or duplicate it.
    act(() => socket.serve("call:incoming", { callId: "c2", visitId: "v1", callerId: "u1", callerName: "Bilal", sdp: { type: "offer", sdp: "v=0" } }));
    expect(socket.sent("call:reject")).toHaveLength(0);
    expect(FakeAudio.instances).toHaveLength(1);

    act(() => socket.serve("call:ended", { callId: "c2" }));
    expect(screen.queryByText("Incoming call")).not.toBeInTheDocument();
    expect(screen.queryByText("Call was declined")).not.toBeInTheDocument();
    expect(playing()).toHaveLength(0);
  });

  it("callee: dismisses on call:missed, and still shows the call when autoplay is blocked", async () => {
    FakeAudio.blockAutoplay = true;
    const socket = renderProvider();
    act(() => socket.serve("call:incoming", { callId: "c3", visitId: "v1", callerId: "u1", callerName: "Bilal", sdp: { type: "offer", sdp: "v=0" } }));
    expect(screen.getByText("Incoming call")).toBeInTheDocument();
    await act(async () => {}); // let the rejected play() settle silently
    act(() => socket.serve("call:missed", { callId: "c3" }));
    expect(screen.queryByText("Incoming call")).not.toBeInTheDocument();
    expect(FakeAudio.instances[0].src).toBe("");
  });

  it("callee: declining stops the ringtone", () => {
    const socket = renderProvider();
    act(() => socket.serve("call:incoming", { callId: "c4", visitId: "v1", callerId: "u1", callerName: "Bilal", sdp: { type: "offer", sdp: "v=0" } }));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(socket.sent("call:reject")).toEqual([{ event: "call:reject", payload: { callId: "c4" } }]);
    expect(playing()).toHaveLength(0);
  });
});
