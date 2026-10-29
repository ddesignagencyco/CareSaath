"use client";

import { Phone, PhoneOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useNow } from "@shared/hooks/use-now";
import type { ActiveCall } from "./call-context";

function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Real WebRTC call UI, driven by the live peer-connection state/streams. */
export function CallOverlay({ call, onAccept, onReject, onEnd }: { call: ActiveCall; onAccept: () => void; onReject: () => void; onEnd: () => void }) {
  const t = useTranslations("common.chat");
  const now = useNow(1000);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot timer start when the call connects
    if (call.status === "connected") setStartedAt((s) => s ?? Date.now());
  }, [call.status]);
  useEffect(() => {
    if (remoteAudio.current && call.remoteStream) remoteAudio.current.srcObject = call.remoteStream;
    if (remoteVideo.current && call.remoteStream) remoteVideo.current.srcObject = call.remoteStream;
  }, [call.remoteStream]);
  useEffect(() => {
    if (localVideo.current && call.localStream) localVideo.current.srcObject = call.localStream;
  }, [call.localStream]);

  const name = call.peerName || t("voiceCall");
  const elapsed = startedAt && now ? now - startedAt : 0;
  const statusText =
    call.status === "incoming" ? t("incomingCall") : call.status === "outgoing" ? t("calling") : call.remoteStream ? fmtDur(elapsed) : t("connecting");

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-ink-900/95 p-8 text-white backdrop-blur">
      <audio ref={remoteAudio} autoPlay />
      {call.video && call.remoteStream && <video ref={remoteVideo} autoPlay playsInline className="absolute inset-0 -z-10 size-full object-cover opacity-80" />}
      {call.video && call.localStream && (
        <video ref={localVideo} autoPlay playsInline muted className="absolute end-5 top-5 h-40 w-28 rounded-xl object-cover shadow-card ring-2 ring-white/20" />
      )}

      <div className="mt-16 flex flex-col items-center gap-3 text-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-white/10 text-4xl font-bold">{(call.peerName || "·").charAt(0).toUpperCase()}</span>
        <p className="text-2xl font-extrabold">{name}</p>
        <p className="tabular text-sm text-white/70">{statusText}</p>
      </div>

      <div className="mb-8 flex items-center gap-6">
        {call.status === "incoming" ? (
          <>
            <button type="button" aria-label={t("decline")} onClick={onReject} className="flex size-16 items-center justify-center rounded-full bg-danger-600 hover:bg-danger-700">
              <PhoneOff className="size-7" />
            </button>
            <button type="button" aria-label={t("accept")} onClick={onAccept} className="flex size-16 items-center justify-center rounded-full bg-success-600 hover:bg-success-700">
              <Phone className="size-7" />
            </button>
          </>
        ) : (
          <button type="button" aria-label={t("endCall")} onClick={onEnd} className="flex size-16 items-center justify-center rounded-full bg-danger-600 hover:bg-danger-700">
            <PhoneOff className="size-7" />
          </button>
        )}
      </div>
    </div>
  );
}
