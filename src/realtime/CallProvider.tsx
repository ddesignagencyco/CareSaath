import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { API_BASE_URL } from '../api/config';
import { http as customerHttp } from '../api/customer/http';
import { http as caregiverHttp } from '../api/caregiver/http';
import { session as customerSession } from '../api/customer/session';
import { session as caregiverSession } from '../api/caregiver/session';
import type { ChatScope } from '../api/chat/types';
import { CallOverlay } from '../screens/shared/chat/CallScreen';

/** Socket.IO connects to the API origin, not the `/api/v1` REST base. */
const ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
/** Minimal WebRTC shapes (the RN TypeScript config has no DOM lib). */
type RtcIceServer = { urls: string | string[]; username?: string; credential?: string };
type RtcConfig = { iceServers: RtcIceServer[] };
type SdpInit = { type?: string; sdp?: string };
type IceInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listenable = { addEventListener(type: string, cb: (e: any) => void): void };

/** STUN-only fallback used until (and if) the backend's TURN config loads. */
const ICE_FALLBACK: RtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export interface ActiveCall {
  status: 'outgoing' | 'incoming' | 'connected';
  callId: string | null;
  peerName: string;
  muted: boolean;
}

export interface CallApi {
  active: ActiveCall | null;
  /** Caller side: a shared active visit id. `calleeId` is optional — the backend derives it from the visit. */
  startCall: (opts: { visitId: string; calleeId?: string; peerName: string }) => void;
  accept: () => void;
  reject: () => void;
  end: () => void;
  toggleMute: () => void;
}

const CallContext = createContext<CallApi | null>(null);

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const mic = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(mic)) return true;
  return (await PermissionsAndroid.request(mic)) === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Real in-app WebRTC **audio** calling over the backend `call:*` signaling relay
 * (video is disabled product-wide). The backend never carries media — audio is
 * peer-to-peer; it only routes SDP offers/answers and ICE candidates between the
 * two apps and logs the call. Mounted per signed-in side so an incoming call can
 * ring on any screen.
 */
export function CallProvider({ scope, children }: { scope: ChatScope; children: ReactNode }) {
  const session = scope === 'customer' ? customerSession : caregiverSession;
  const http = scope === 'customer' ? customerHttp : caregiverHttp;

  const [active, setActive] = useState<ActiveCall | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingOffer = useRef<{ callId: string; sdp: SdpInit } | null>(null);
  const iceRef = useRef<RtcConfig>(ICE_FALLBACK);

  const teardown = useCallback(() => {
    pcRef.current?.getSenders().forEach(s => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null;
    callIdRef.current = null;
    pendingOffer.current = null;
    setActive(null);
  }, []);

  // Load STUN/TURN once; keep the STUN fallback on any failure.
  useEffect(() => {
    if (!session.get()?.accessToken) return;
    let cancelled = false;
    http
      .get<{ iceServers: RtcIceServer[] }>('/realtime/ice-servers')
      .then(data => {
        if (!cancelled && data?.iceServers?.length) iceRef.current = { iceServers: data.iceServers };
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [http, session]);

  const newPeer = useCallback(() => {
    const pc = new RTCPeerConnection(iceRef.current);
    // react-native-webrtc uses the EventTarget API.
    (pc as unknown as Listenable).addEventListener('icecandidate', (e: unknown) => {
      const cand = (e as { candidate?: { toJSON?: () => unknown } }).candidate;
      if (cand && callIdRef.current) socketRef.current?.emit('call:ice-candidate', { callId: callIdRef.current, candidate: cand.toJSON ? cand.toJSON() : cand });
    });
    (pc as unknown as Listenable).addEventListener('track', (e: unknown) => {
      const stream = (e as { streams?: MediaStream[] }).streams?.[0];
      if (stream) setActive(a => (a ? { ...a, status: 'connected' } : a));
    });
    (pc as unknown as Listenable).addEventListener('connectionstatechange', () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        if (callIdRef.current) socketRef.current?.emit('call:end', { callId: callIdRef.current });
        teardown();
      }
    });
    return pc;
  }, [teardown]);

  const getMedia = useCallback(async () => {
    const stream = (await mediaDevices.getUserMedia({ audio: true, video: false })) as unknown as MediaStream;
    localRef.current = stream;
    return stream;
  }, []);

  // Socket lifecycle + call:* listeners.
  useEffect(() => {
    if (!session.get()?.accessToken) return;
    const socket = io(ORIGIN, {
      transports: ['websocket'],
      extraHeaders: { 'ngrok-skip-browser-warning': '1' },
      auth: cb => cb({ token: session.get()?.accessToken ?? '' }),
    });
    socketRef.current = socket;

    socket.on('call:incoming', (p: { callId: string; visitId: string; callerId: string; sdp: SdpInit }) => {
      if (callIdRef.current) {
        socket.emit('call:reject', { callId: p.callId });
        return;
      }
      pendingOffer.current = { callId: p.callId, sdp: p.sdp };
      callIdRef.current = p.callId;
      setActive({ status: 'incoming', callId: p.callId, peerName: '', muted: false });
    });

    socket.on('call:answered', async (p: { callId: string; sdp: SdpInit }) => {
      try {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(p.sdp as unknown as ConstructorParameters<typeof RTCSessionDescription>[0]));
        setActive(a => (a ? { ...a, status: 'connected' } : a));
      } catch {
        teardown();
      }
    });

    socket.on('call:ice-candidate', async (p: { callId: string; candidate: IceInit }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(p.candidate));
      } catch {
        // candidate can arrive before the remote description; safe to ignore
      }
    });

    socket.on('call:ended', teardown);
    socket.on('call:rejected', teardown);
    socket.on('call:error', teardown);

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
      teardown();
    };
    // Handlers read via refs; re-subscribing per call would drop events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const startCall = useCallback(
    async (opts: { visitId: string; calleeId?: string; peerName: string }) => {
      if (active) return;
      if (!(await ensureMicPermission())) return;
      try {
        setActive({ status: 'outgoing', callId: null, peerName: opts.peerName, muted: false });
        const stream = await getMedia();
        const pc = newPeer();
        pcRef.current = pc;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('call:invite', { visitId: opts.visitId, ...(opts.calleeId ? { calleeId: opts.calleeId } : {}), sdp: offer });
      } catch {
        teardown();
      }
    },
    [active, getMedia, newPeer, teardown],
  );

  const accept = useCallback(async () => {
    const offer = pendingOffer.current;
    if (!offer) return;
    if (!(await ensureMicPermission())) {
      socketRef.current?.emit('call:reject', { callId: offer.callId });
      teardown();
      return;
    }
    try {
      const stream = await getMedia();
      const pc = newPeer();
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp as unknown as ConstructorParameters<typeof RTCSessionDescription>[0]));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('call:answer', { callId: offer.callId, sdp: answer });
      setActive(a => (a ? { ...a, status: 'connected' } : a));
      pendingOffer.current = null;
    } catch {
      socketRef.current?.emit('call:reject', { callId: offer.callId });
      teardown();
    }
  }, [getMedia, newPeer, teardown]);

  const reject = useCallback(() => {
    if (callIdRef.current) socketRef.current?.emit('call:reject', { callId: callIdRef.current });
    teardown();
  }, [teardown]);

  const end = useCallback(() => {
    if (callIdRef.current) socketRef.current?.emit('call:end', { callId: callIdRef.current });
    teardown();
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setActive(a => (a ? { ...a, muted: !track.enabled } : a));
  }, []);

  const api = useMemo<CallApi>(() => ({ active, startCall, accept, reject, end, toggleMute }), [active, startCall, accept, reject, end, toggleMute]);

  return (
    <CallContext.Provider value={api}>
      {children}
      {active && <CallOverlay call={active} onAccept={accept} onReject={reject} onEnd={end} onToggleMute={toggleMute} />}
    </CallContext.Provider>
  );
}

/** Null when no CallProvider is mounted. */
export function useCall(): CallApi | null {
  return useContext(CallContext);
}
