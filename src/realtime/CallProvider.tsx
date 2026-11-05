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
import { useToast } from '../components/overlay';
import { useApiErrorText } from '../lib/query';
import { useT } from '../i18n';
import { CallSounds } from './CallSounds';

/** Socket.IO connects to the API origin, not the `/api/v1` REST base. */
const ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
/** Minimal WebRTC shapes (the RN TypeScript config has no DOM lib). */
type RtcIceServer = { urls: string | string[]; username?: string; credential?: string };
type RtcConfig = { iceServers: RtcIceServer[] };
type SdpInit = { type?: string; sdp?: string };
type IceInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
type Listenable = { addEventListener(type: string, cb: (e: any) => void): void };

/** STUN-only fallback used until (and if) the backend's TURN config loads. */
const ICE_FALLBACK: RtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
/** Server rings for this long when `call:outgoing` omits it. */
const DEFAULT_RING_SECONDS = 30;
/** Grace on top of the server's ring window before the caller gives up on its own. */
const RING_GRACE_MS = 5000;

export interface ActiveCall {
  status: 'outgoing' | 'incoming' | 'connected';
  callId: string | null;
  peerName: string;
  muted: boolean;
  /** Caller side: the server confirmed the invite (`call:outgoing`) and is ringing the callee. */
  ringing?: boolean;
  /** Caller side: the callee had a live socket when the call started. */
  calleeOnline?: boolean;
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
  /** Callee tapped Accept; silence the ringtone while media and the answer are set up. */
  const [answering, setAnswering] = useState(false);
  const toast = useToast();
  const apiError = useApiErrorText();
  const tChat = useT('mobile.chat');
  // Read from the socket listeners, which are attached once; a ref keeps them current.
  const showError = useRef((message?: string) => toast.error(apiError(new Error(message || ''))));
  showError.current = (message?: string) => toast.error(apiError(new Error(message || '')));
  // "No answer" toast for a ring that timed out; read from listeners/timers, so ref-held too.
  const showNoAnswer = useRef<(notified: boolean) => void>(() => undefined);
  showNoAnswer.current = (notified: boolean) => toast.info(notified ? tChat('noAnswerNotified') : tChat('noAnswer'));
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingOffer = useRef<{ callId: string; sdp: SdpInit } | null>(null);
  const iceRef = useRef<RtcConfig>(ICE_FALLBACK);
  /** Caller's local ICE candidates gathered before `call:outgoing` hands us the callId. */
  const pendingIce = useRef<unknown[]>([]);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Caller side: whether the callee was online, for the "No answer" wording. */
  const calleeOnlineRef = useRef(false);

  const clearRingTimer = useCallback(() => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    ringTimer.current = null;
  }, []);

  const teardown = useCallback(() => {
    clearRingTimer();
    pcRef.current?.getSenders().forEach(s => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null;
    callIdRef.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
    calleeOnlineRef.current = false;
    setAnswering(false);
    setActive(null);
  }, [clearRingTimer]);

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
      if (!cand) return;
      const candidate = cand.toJSON ? cand.toJSON() : cand;
      if (callIdRef.current) socketRef.current?.emit('call:ice-candidate', { callId: callIdRef.current, candidate });
      else pendingIce.current.push(candidate);
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
      transports: ['websocket', 'polling'],
      extraHeaders: { 'ngrok-skip-browser-warning': '1' },
      auth: cb => cb({ token: session.get()?.accessToken ?? '' }),
    });
    socketRef.current = socket;

    socket.on('call:incoming', (p: { callId: string; visitId: string; callerId: string; callerName?: string; sdp: SdpInit }) => {
      // `call:sync` can re-deliver the call that is already ringing here.
      if (callIdRef.current === p.callId) return;
      if (callIdRef.current || pcRef.current) {
        socket.emit('call:reject', { callId: p.callId });
        return;
      }
      pendingOffer.current = { callId: p.callId, sdp: p.sdp };
      callIdRef.current = p.callId;
      setActive({ status: 'incoming', callId: p.callId, peerName: p.callerName ?? '', muted: false });
    });

    // Caller side: the server accepted the invite and is ringing the callee.
    socket.on('call:outgoing', (p: { callId: string; calleeOnline?: boolean; ringSeconds?: number }) => {
      if (!pcRef.current) {
        // We hung up before the server confirmed the invite: stop it ringing the callee.
        socket.emit('call:end', { callId: p.callId });
        return;
      }
      if (callIdRef.current && callIdRef.current !== p.callId) return;
      callIdRef.current = p.callId;
      calleeOnlineRef.current = !!p.calleeOnline;
      pendingIce.current.forEach(candidate => socket.emit('call:ice-candidate', { callId: p.callId, candidate }));
      pendingIce.current = [];
      setActive(a => (a && a.status === 'outgoing' ? { ...a, callId: p.callId, ringing: true, calleeOnline: !!p.calleeOnline } : a));
      clearRingTimer();
      // Safety net in case `call:missed` never reaches us (dropped socket, server restart).
      ringTimer.current = setTimeout(() => {
        ringTimer.current = null;
        if (callIdRef.current !== p.callId) return;
        socket.emit('call:end', { callId: p.callId });
        showNoAnswer.current(calleeOnlineRef.current === false);
        teardown();
      }, (p.ringSeconds || DEFAULT_RING_SECONDS) * 1000 + RING_GRACE_MS);
    });

    // Nobody answered within the ring window; sent to both sides.
    socket.on('call:missed', (p: { callId?: string }) => {
      if (!callIdRef.current || (p?.callId && p.callId !== callIdRef.current)) return;
      // Caller: peer connection up, no offer pending. Callee: just stop ringing, no toast.
      if (pcRef.current && !pendingOffer.current) showNoAnswer.current(calleeOnlineRef.current === false);
      teardown();
    });

    socket.on('call:answered', async (p: { callId: string; sdp: SdpInit }) => {
      clearRingTimer();
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
    // Say why the call ended (callee offline, no active booking) instead of closing silently.
    socket.on('call:error', (p: { message?: string }) => {
      showError.current(p?.message);
      teardown();
    });

    // Ask whether a call is still ringing for us — e.g. the app was opened from an
    // "Incoming call" push. Fires on the first connect and on every reconnect.
    socket.on('connect', () => {
      socket.emit('call:sync');
    });

    // Keep auth token fresh on background rotation
    const unsub = session.subscribe(() => {
      const freshToken = session.get()?.accessToken;
      if (freshToken && socketRef.current) {
        socketRef.current.auth = { token: freshToken };
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
      }
    });

    return () => {
      unsub();
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
    setAnswering(true);
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
      setAnswering(false);
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

  // Phone-style ringing: ringback for the caller once the server is ringing the
  // callee, ringtone for the callee until they answer. Connecting, teardown and
  // unmount all change `active`, which unmounts the player and stops the sound.
  const sound = active?.status === 'outgoing' && active.ringing ? 'ringback' : active?.status === 'incoming' && !answering ? 'ringtone' : null;

  const api = useMemo<CallApi>(() => ({ active, startCall, accept, reject, end, toggleMute }), [active, startCall, accept, reject, end, toggleMute]);

  return (
    <CallContext.Provider value={api}>
      {children}
      <CallSounds sound={sound} />
      {active && <CallOverlay call={active} onAccept={accept} onReject={reject} onEnd={end} onToggleMute={toggleMute} />}
    </CallContext.Provider>
  );
}

/** Null when no CallProvider is mounted. */
export function useCall(): CallApi | null {
  return useContext(CallContext);
}
