"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { io, type Socket } from "socket.io-client";
import { API_BASE_URL, createHttp } from "@shared/api/http";
import type { SessionStore } from "@shared/api/session";
import { useToast } from "@shared/ui/toast";
import { CallOverlay } from "./call-overlay";

/** Socket.IO connects to the API origin, not the `/api/v1` REST base. */
const ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
/** STUN-only fallback used until (and if) the backend's TURN config loads. */
const ICE_FALLBACK: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
/** Maximum time an outgoing call can ring before auto-cancelling (40s). */
const RING_TIMEOUT_MS = 40_000;
/** Grace period for temporary network/signal blips before concluding the call dropped (8s). */
const RECONNECT_GRACE_MS = 8_000;

function createSilentAudioStream(): MediaStream {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      oscillator.connect(dst);
      oscillator.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) {
        track.enabled = false;
      }
      return dst.stream;
    }
  } catch {
    /* fallback to empty stream */
  }
  return new MediaStream();
}

export interface ActiveCall {
  status: "outgoing" | "incoming" | "connected" | "reconnecting";
  callId: string | null;
  peerName: string;
  video: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export interface CallApi {
  active: ActiveCall | null;
  /** Caller side: needs the callee's **user id** and a shared active visit. */
  startCall: (opts: { visitId: string; calleeId?: string; peerName: string; video: boolean }) => void;
  accept: () => void;
  reject: () => void;
  end: () => void;
}

const CallContext = createContext<CallApi | null>(null);

/**
 * Real in-app WebRTC calling over the backend `call:*` signaling relay.
 * Handles signal drops, transient reconnects, ring timeouts, missing mic fallback, alerts/toasts, and graceful teardown.
 */
export function CallProvider({ session, enabled, children }: { session: SessionStore; enabled: boolean; children: ReactNode }) {
  const [active, setActive] = useState<ActiveCall | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const toast = useToast();
  const t = useTranslations("common.chat");

  const toastRef = useRef(toast);
  const tRef = useRef(t);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync ref with latest state to prevent stale closures in socket events
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // An incoming offer waits here until the user accepts.
  const pendingOffer = useRef<{ callId: string; sdp: RTCSessionDescriptionInit; video: boolean } | null>(null);
  // ICE config: STUN until GET /realtime/ice-servers returns the server's STUN + short-lived TURN.
  const iceRef = useRef<RTCConfiguration>(ICE_FALLBACK);
  const http = useMemo(() => createHttp(session), [session]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearTimers();
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    callIdRef.current = null;
    pendingOffer.current = null;
    pendingCandidates.current = [];
    setActive(null);
  }, [clearTimers]);

  const teardownRef = useRef(teardown);

  const flushCandidates = useCallback((callId: string) => {
    callIdRef.current = callId;
    if (pendingCandidates.current.length > 0 && socketRef.current) {
      for (const candidate of pendingCandidates.current) {
        socketRef.current.emit("call:ice-candidate", { callId, candidate });
      }
      pendingCandidates.current = [];
    }
  }, []);

  const flushCandidatesRef = useRef(flushCandidates);

  // Keep callback/context refs fresh without triggering socket re-creation
  useEffect(() => {
    toastRef.current = toast;
    tRef.current = t;
    teardownRef.current = teardown;
    flushCandidatesRef.current = flushCandidates;
  });

  // Gracefully handle browser tab close or reload while in a call
  useEffect(() => {
    const handleUnload = () => {
      if (callIdRef.current && socketRef.current) {
        socketRef.current.emit("call:end", { callId: callIdRef.current });
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Load STUN/TURN servers once a session is active; keep the STUN fallback on any failure.
  useEffect(() => {
    if (!enabled || !session.get()) return;
    let cancelled = false;
    http
      .get<{ iceServers: RTCIceServer[] }>("/realtime/ice-servers")
      .then((data) => {
        if (!cancelled && data?.iceServers?.length) iceRef.current = { iceServers: data.iceServers };
      })
      .catch(() => {
        /* keep the STUN fallback — a TURN fetch failure must not block calling */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, session, http]);

  const newPeer = useCallback(() => {
    const pc = new RTCPeerConnection(iceRef.current);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const c = e.candidate.toJSON();
        if (callIdRef.current) {
          socketRef.current?.emit("call:ice-candidate", { callId: callIdRef.current, candidate: c });
        } else {
          pendingCandidates.current.push(c);
        }
      }
    };

    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? null;
      setActive((a) => (a ? { ...a, remoteStream: remote, status: "connected" } : a));
    };

    // Handle temporary network drops vs permanent failures
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        setActive((a) => (a ? { ...a, status: "connected" } : a));
      } else if (state === "disconnected") {
        // Temporary packet/signal drop — show "Connecting..." and allow 8s recovery
        setActive((a) => (a ? { ...a, status: "reconnecting" } : a));
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
            toastRef.current.error("Call disconnected due to lost connection");
            teardownRef.current();
          }, RECONNECT_GRACE_MS);
        }
      } else if (["failed", "closed"].includes(state)) {
        if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
        teardownRef.current();
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === "connected" || iceState === "completed") {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        setActive((a) => (a ? { ...a, status: "connected" } : a));
      } else if (iceState === "disconnected") {
        setActive((a) => (a ? { ...a, status: "reconnecting" } : a));
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
            toastRef.current.error("Call disconnected due to lost connection");
            teardownRef.current();
          }, RECONNECT_GRACE_MS);
        }
      } else if (iceState === "failed") {
        if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
        teardownRef.current();
      }
    };

    return pc;
  }, []);

  const getMedia = useCallback(async (video: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      localRef.current = stream;
      return stream;
    } catch (err) {
      const error = err as { name?: string; message?: string };
      // When testing on a PC/laptop without a mic or when device is not found,
      // create a silent dummy audio stream so WebRTC connects smoothly for testing.
      if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
        console.warn("[getMedia] No microphone found on this device; using silent dummy audio track so call connects.");
        const fallbackStream = createSilentAudioStream();
        localRef.current = fallbackStream;
        return fallbackStream;
      }
      throw err;
    }
  }, []);

  // Socket lifecycle + call:* listeners.
  useEffect(() => {
    const currentSession = session.get();
    if (!enabled || !currentSession) return;
    const socket = io(ORIGIN, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("call:outgoing", (p: { callId: string }) => {
      callIdRef.current = p.callId;
      setActive((a) => (a ? { ...a, callId: p.callId } : a));
      flushCandidatesRef.current(p.callId);
    });

    socket.on("call:incoming", (p: { callId: string; visitId: string; callerId: string; callerName?: string; sdp: RTCSessionDescriptionInit }) => {
      // Ignore a second incoming call while one is active (callIdRef is always current).
      if (callIdRef.current) {
        socket.emit("call:reject", { callId: p.callId });
        return;
      }
      const video = p.sdp?.sdp?.includes("m=video") ?? false;
      pendingOffer.current = { callId: p.callId, sdp: p.sdp, video };
      callIdRef.current = p.callId;
      setActive({ status: "incoming", callId: p.callId, peerName: p.callerName || "", video, localStream: null, remoteStream: null });
    });

    socket.on("call:answered", async (p: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      try {
        if (ringTimerRef.current) {
          clearTimeout(ringTimerRef.current);
          ringTimerRef.current = null;
        }
        callIdRef.current = p.callId;
        flushCandidatesRef.current(p.callId);
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(p.sdp));
        setActive((a) => (a ? { ...a, callId: p.callId, status: "connected" } : a));
      } catch {
        teardownRef.current();
      }
    });

    socket.on("call:ice-candidate", async (p: { callId: string; candidate: RTCIceCandidateInit }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(p.candidate));
      } catch {
        // candidate can arrive before remote description; safely handled
      }
    });

    socket.on("call:ended", () => {
      if (activeRef.current?.status === "connected") {
        toastRef.current.info(tRef.current("callEnded"));
      } else {
        toastRef.current.error(tRef.current("callDeclined"));
      }
      teardownRef.current();
    });

    socket.on("call:rejected", () => {
      toastRef.current.error(tRef.current("callDeclined"));
      teardownRef.current();
    });

    socket.on("call:error", (err: { message?: string }) => {
      console.warn("[call:error]", err?.message);
      toastRef.current.error(err?.message || tRef.current("userOffline"));
      teardownRef.current();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      teardownRef.current();
    };
  }, [enabled, session]);

  const startCall = useCallback(
    async (opts: { visitId: string; calleeId?: string; peerName: string; video: boolean }) => {
      if (active) return;
      try {
        pendingCandidates.current = [];
        setActive({ status: "outgoing", callId: null, peerName: opts.peerName, video: opts.video, localStream: null, remoteStream: null });

        // Start ring timeout (if not answered in 40 seconds, auto-cancel)
        if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
        ringTimerRef.current = setTimeout(() => {
          if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
          toastRef.current.error(tRef.current("callTimeout"));
          teardownRef.current();
        }, RING_TIMEOUT_MS);

        const stream = await getMedia(opts.video);
        const pc = newPeer();
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        setActive((a) => (a ? { ...a, localStream: stream } : a));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("call:invite", {
          visitId: opts.visitId,
          ...(opts.calleeId ? { calleeId: opts.calleeId } : {}),
          sdp: offer,
        });
      } catch (err) {
        const error = err as { name?: string; message?: string };
        if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
          toastRef.current.error(tRef.current("micBlocked"));
        } else {
          console.warn("[startCall failed]", err);
          toastRef.current.error(error?.message || "Failed to start call");
        }
        teardownRef.current();
      }
    },
    [active, getMedia, newPeer],
  );

  const accept = useCallback(async () => {
    const offer = pendingOffer.current;
    if (!offer) return;
    try {
      const stream = await getMedia(offer.video);
      const pc = newPeer();
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit("call:answer", { callId: offer.callId, sdp: answer });
      setActive((a) => (a ? { ...a, status: "connected", localStream: stream } : a));
      pendingOffer.current = null;
    } catch {
      if (offer.callId) socketRef.current?.emit("call:reject", { callId: offer.callId });
      teardownRef.current();
    }
  }, [getMedia, newPeer]);

  const reject = useCallback(() => {
    if (callIdRef.current) socketRef.current?.emit("call:reject", { callId: callIdRef.current });
    teardownRef.current();
  }, []);

  const end = useCallback(() => {
    if (activeRef.current?.status === "connected") {
      toastRef.current.info(tRef.current("callEnded"));
    }
    if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
    teardownRef.current();
  }, []);

  const api = useMemo<CallApi>(() => ({ active, startCall, accept, reject, end }), [active, startCall, accept, reject, end]);

  return (
    <CallContext.Provider value={api}>
      {children}
      {active && <CallOverlay call={active} onAccept={accept} onReject={reject} onEnd={end} />}
    </CallContext.Provider>
  );
}

/** Null when no CallProvider is mounted (e.g. mock mode) — callers fall back to the demo overlay. */
export function useCallOptional(): CallApi | null {
  return useContext(CallContext);
}
