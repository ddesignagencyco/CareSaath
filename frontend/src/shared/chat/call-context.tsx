"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "@shared/api/http";
import type { SessionStore } from "@shared/api/session";
import { CallOverlay } from "./call-overlay";

/** Socket.IO connects to the API origin, not the `/api/v1` REST base. */
const ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export interface ActiveCall {
  status: "outgoing" | "incoming" | "connected";
  callId: string | null;
  peerName: string;
  video: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export interface CallApi {
  active: ActiveCall | null;
  /** Caller side: needs the callee's **user id** and a shared active visit. */
  startCall: (opts: { visitId: string; calleeId: string; peerName: string; video: boolean }) => void;
  accept: () => void;
  reject: () => void;
  end: () => void;
}

const CallContext = createContext<CallApi | null>(null);

/**
 * Real in-app WebRTC calling over the backend `call:*` signaling relay. The
 * backend never carries media — audio/video is peer-to-peer; it only routes
 * SDP offers/answers and ICE candidates between the two apps and logs the call.
 * Mounted app-wide so an incoming call can ring on any screen.
 */
export function CallProvider({ session, enabled, children }: { session: SessionStore; enabled: boolean; children: ReactNode }) {
  const [active, setActive] = useState<ActiveCall | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  // An incoming offer waits here until the user accepts.
  const pendingOffer = useRef<{ callId: string; sdp: RTCSessionDescriptionInit; video: boolean } | null>(null);

  const teardown = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    callIdRef.current = null;
    pendingOffer.current = null;
    setActive(null);
  }, []);

  const newPeer = useCallback(() => {
    const pc = new RTCPeerConnection(ICE);
    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) socketRef.current?.emit("call:ice-candidate", { callId: callIdRef.current, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? null;
      setActive((a) => (a ? { ...a, remoteStream: remote, status: "connected" } : a));
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
        teardown();
      }
    };
    return pc;
  }, [teardown]);

  const getMedia = useCallback(async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    localRef.current = stream;
    return stream;
  }, []);

  // Socket lifecycle + call:* listeners.
  useEffect(() => {
    if (!enabled || !session.get()?.accessToken) return;
    const socket = io(ORIGIN, { transports: ["websocket"], auth: (cb) => cb({ token: session.get()?.accessToken ?? "" }) });
    socketRef.current = socket;

    socket.on("call:incoming", (p: { callId: string; visitId: string; callerId: string; sdp: RTCSessionDescriptionInit }) => {
      // Ignore a second incoming call while one is active (callIdRef is always current).
      if (callIdRef.current) {
        socket.emit("call:reject", { callId: p.callId });
        return;
      }
      const video = p.sdp?.sdp?.includes("m=video") ?? false;
      pendingOffer.current = { callId: p.callId, sdp: p.sdp, video };
      callIdRef.current = p.callId;
      setActive({ status: "incoming", callId: p.callId, peerName: "", video, localStream: null, remoteStream: null });
    });

    socket.on("call:answered", async (p: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      try {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(p.sdp));
        setActive((a) => (a ? { ...a, status: "connected" } : a));
      } catch {
        teardown();
      }
    });

    socket.on("call:ice-candidate", async (p: { callId: string; candidate: RTCIceCandidateInit }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(p.candidate));
      } catch {
        // candidate can arrive before the remote description; browsers queue/ignore safely
      }
    });

    socket.on("call:ended", teardown);
    socket.on("call:rejected", teardown);
    socket.on("call:error", teardown);

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
      teardown();
    };
    // `active`/`teardown` are read via refs inside handlers; re-subscribing per call would drop events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, session]);

  const startCall = useCallback(
    async (opts: { visitId: string; calleeId: string; peerName: string; video: boolean }) => {
      if (active) return;
      try {
        setActive({ status: "outgoing", callId: null, peerName: opts.peerName, video: opts.video, localStream: null, remoteStream: null });
        const stream = await getMedia(opts.video);
        const pc = newPeer();
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        setActive((a) => (a ? { ...a, localStream: stream } : a));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("call:invite", { visitId: opts.visitId, calleeId: opts.calleeId, sdp: offer });
      } catch {
        teardown();
      }
    },
    [active, getMedia, newPeer, teardown],
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
      teardown();
    }
  }, [getMedia, newPeer, teardown]);

  const reject = useCallback(() => {
    if (callIdRef.current) socketRef.current?.emit("call:reject", { callId: callIdRef.current });
    teardown();
  }, [teardown]);

  const end = useCallback(() => {
    if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
    teardown();
  }, [teardown]);

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
