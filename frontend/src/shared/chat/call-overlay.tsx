"use client";

import {
  ChevronDown,
  Maximize2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useNow } from "@shared/hooks/use-now";
import type { ActiveCall } from "./call-context";

function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Real WebRTC call UI with crisp solid dark canvas, high contrast typography, and PiP minimize. */
export function CallOverlay({
  call,
  onAccept,
  onReject,
  onEnd,
}: {
  call: ActiveCall;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
}) {
  const t = useTranslations("common.chat");
  const now = useNow(1000);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

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

  const toggleMic = () => {
    if (call.localStream) {
      const audioTrack = call.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        return;
      }
    }
    setIsMuted((prev) => !prev);
  };

  const toggleSpeaker = () => {
    if (remoteAudio.current) {
      remoteAudio.current.muted = !remoteAudio.current.muted;
      setIsSpeakerMuted(remoteAudio.current.muted);
      return;
    }
    setIsSpeakerMuted((prev) => !prev);
  };

  const name = call.peerName || t("voiceCall");
  const elapsed = startedAt && now ? now - startedAt : 0;
  const statusText =
    call.status === "incoming"
      ? t("incomingCall")
      : call.status === "outgoing"
        ? call.ringing
          ? t("ringing")
          : t("calling")
        : call.status === "reconnecting"
          ? t("connecting")
          : call.remoteStream
            ? fmtDur(elapsed)
            : t("connecting");

  /* ------------------- Minimized Floating View (PiP) ------------------- */
  if (isMinimized) {
    return (
      <div className="fixed top-5 end-5 z-[70] flex items-center gap-3.5 rounded-2xl border border-slate-700/90 bg-slate-900 px-4 py-3 text-white shadow-[0_15px_40px_rgba(0,0,0,0.7)] animate-in fade-in slide-in-from-top-3">
        <audio ref={remoteAudio} autoPlay muted={isSpeakerMuted} />
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-3 text-start transition-opacity hover:opacity-90"
        >
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand-700 to-teal-500 text-sm font-bold text-white shadow-md">
            {(call.peerName || "·").charAt(0).toUpperCase()}
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-slate-900 bg-emerald-500" />
          </div>
          <div className="min-w-0 pr-1">
            <p className="truncate text-xs font-bold text-white">{name}</p>
            <p className="font-mono text-[11px] font-semibold text-emerald-400">{statusText}</p>
          </div>
        </button>

        <div className="flex items-center gap-1.5 border-s border-slate-700/80 ps-2.5">
          <button
            type="button"
            onClick={toggleMic}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
            className={`flex size-8 items-center justify-center rounded-full transition-colors ${
              isMuted
                ? "bg-rose-500/25 text-rose-300 border border-rose-500/40"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onEnd}
            title={t("endCall")}
            className="flex size-8 items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-700 active:scale-95 shadow-md shadow-red-600/30"
          >
            <PhoneOff className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            title="Maximize call"
            className="flex size-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  /* ------------------- Full-Screen Call Overlay ------------------- */
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-between overflow-hidden bg-gradient-to-b from-[#0f172a] via-[#0b1120] to-[#060911] p-6 text-white select-none sm:p-10">
      <audio ref={remoteAudio} autoPlay muted={isSpeakerMuted} />
      {call.video && call.remoteStream && (
        <video ref={remoteVideo} autoPlay playsInline className="absolute inset-0 -z-10 size-full object-cover opacity-80" />
      )}
      {call.video && call.localStream && (
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className="absolute end-6 top-6 h-40 w-28 rounded-2xl object-cover shadow-2xl ring-2 ring-white/20"
        />
      )}

      {/* Ambient soft glow behind hero avatar */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/10 blur-[120px]" />

      {/* Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          className="flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/90 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white shadow-md active:scale-95"
        >
          <ChevronDown className="size-4" />
          <span>Minimize</span>
        </button>

        <div className="flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800/90 px-4 py-1.5 text-xs font-medium text-slate-300 shadow-md">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span>End-to-end encrypted</span>
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/90 px-3.5 py-1.5 text-xs font-medium text-slate-400 shadow-md">
          <span className="size-2 rounded-full bg-emerald-400" />
          <span>HD Voice</span>
        </div>
      </div>

      {/* Center Hero: Avatar, Name, Status Pill */}
      <div className="relative z-10 my-auto flex flex-col items-center gap-6">
        {/* Pulsing Avatar with crisp rings */}
        <div className="relative flex items-center justify-center">
          {call.status === "connected" && (
            <>
              <div className="absolute size-48 rounded-full border border-teal-500/20 animate-ping opacity-30" />
              <div className="absolute size-44 rounded-full border border-teal-500/30 animate-pulse opacity-50" />
            </>
          )}
          {call.status === "outgoing" && (
            <>
              <div className="absolute size-52 rounded-full border-2 border-brand-500/20 animate-ping" />
              <div className="absolute size-44 rounded-full border-2 border-brand-400/35 animate-pulse" />
            </>
          )}

          <div className="relative flex size-36 items-center justify-center rounded-full bg-gradient-to-tr from-brand-700 via-brand-600 to-teal-500 text-5xl font-extrabold text-white shadow-[0_0_60px_rgba(20,184,166,0.35)] ring-4 ring-brand-400/40 ring-offset-4 ring-offset-[#0b1120] sm:size-44 sm:text-6xl">
            {(call.peerName || "·").charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-lg sm:text-4xl">
            {name}
          </h2>

          {/* Status Pill Badge with sharp contrast & audio bars */}
          <div className="flex items-center gap-2.5 rounded-full border border-slate-700/90 bg-slate-800/95 px-5 py-2 shadow-lg">
            {call.status === "connected" && (
              <>
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
                <p className="font-mono text-sm font-bold tracking-wider text-emerald-400">{statusText}</p>
                {/* Visual animated audio waveform indicator */}
                <div className="flex items-center gap-1 ps-1.5" aria-hidden="true">
                  <span className="h-2 w-0.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDuration: "0.6s" }} />
                  <span className="h-3.5 w-0.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDuration: "0.4s" }} />
                  <span className="h-2.5 w-0.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDuration: "0.8s" }} />
                  <span className="h-4 w-0.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDuration: "0.5s" }} />
                </div>
              </>
            )}
            {call.status === "outgoing" && (
              <>
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-teal-500" />
                </span>
                <p className="font-mono text-sm font-semibold tracking-wide text-teal-300">{statusText}</p>
              </>
            )}
            {call.status === "incoming" && (
              <>
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
                <p className="font-mono text-sm font-semibold tracking-wide text-emerald-400">{statusText}</p>
              </>
            )}
            {call.status === "reconnecting" && (
              <>
                <span className="size-2.5 rounded-full bg-amber-400 animate-pulse" />
                <p className="font-mono text-sm font-semibold tracking-wide text-amber-300">{statusText}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Control Dock with solid contrast */}
      <div className="relative z-10 mx-auto mb-4 flex items-center justify-center">
        {call.status === "incoming" ? (
          <div className="flex items-center gap-12">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label={t("decline")}
                onClick={onReject}
                className="flex size-16 items-center justify-center rounded-full bg-red-600 shadow-xl shadow-red-600/40 transition-all hover:scale-105 hover:bg-red-700 active:scale-95"
              >
                <PhoneOff className="size-7 text-white" />
              </button>
              <span className="text-xs font-semibold text-slate-300">{t("decline")}</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label={t("accept")}
                onClick={onAccept}
                className="flex size-16 items-center justify-center rounded-full bg-emerald-600 shadow-xl shadow-emerald-600/40 transition-all hover:scale-105 hover:bg-emerald-700 active:scale-95 animate-bounce"
              >
                <Phone className="size-7 text-white" />
              </button>
              <span className="text-xs font-semibold text-slate-300">{t("accept")}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-6 rounded-3xl border border-slate-700/80 bg-slate-900/95 px-7 py-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-md">
            {/* Mute Mic Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMic}
                aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                title={isMuted ? "Unmute" : "Mute"}
                className={`flex size-14 items-center justify-center rounded-2xl transition-all ${
                  isMuted
                    ? "bg-rose-500/25 text-rose-300 border border-rose-500/50 shadow-inner"
                    : "bg-slate-800 text-white hover:bg-slate-700 active:scale-95 border border-slate-700/80"
                }`}
              >
                {isMuted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </button>
              <span className="text-[11px] font-medium text-slate-400">
                {isMuted ? t("unmute") : t("mute")}
              </span>
            </div>

            {/* Mute Speaker Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={toggleSpeaker}
                aria-label={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
                title={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
                className={`flex size-14 items-center justify-center rounded-2xl transition-all ${
                  isSpeakerMuted
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-inner"
                    : "bg-slate-800 text-white hover:bg-slate-700 active:scale-95 border border-slate-700/80"
                }`}
              >
                {isSpeakerMuted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
              </button>
              <span className="text-[11px] font-medium text-slate-400">
                {isSpeakerMuted ? "Muted" : "Speaker"}
              </span>
            </div>

            {/* End Call Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label={t("endCall")}
                onClick={onEnd}
                className="flex size-16 items-center justify-center rounded-full bg-red-600 shadow-xl shadow-red-600/50 transition-all hover:scale-105 hover:bg-red-700 active:scale-95"
              >
                <PhoneOff className="size-7 text-white" />
              </button>
              <span className="text-[11px] font-semibold text-red-400">{t("endCall")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
