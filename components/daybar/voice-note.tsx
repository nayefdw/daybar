"use client";
// Voice notes: recording one, and the player (after rareui's Voice note).
//
// The recorder is a pill with a pulsing dot, live level bars and the time;
// the tick keeps the recording, the cross throws it away. The recording is
// uploaded to the note's own page (/api/upload, the page's rights) and the
// note keeps its file, length and 40 peaks (lib/daybar/store.ts).
//
// The player is a pill: a round play button whose triangle morphs into the
// pause bars, the recording's waveform filling as it plays (drag or arrow
// keys to seek), the time left with the speed (1×, 1.5×, 2×), and a soft
// glow of light orbiting the pill while it plays.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Mic, X } from "lucide-react";
import type { VoiceAudio } from "@/lib/daybar/model";
import { useT } from "../i18n";

const PEAKS = 40;
const MAX_SECONDS = 30 * 60;
const SPEEDS = [1, 1.5, 2];
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

// The play triangle split in two quads, so it morphs into the pause bars.
const PLAY = "M7.7 5.8 L13 8.9 L13 15.1 L7.7 18.2 Z M13 8.9 L18.3 12 L18.3 12 L13 15.1 Z";
const PAUSE = "M8.2 6.8 L10.9 6.8 L10.9 17.2 L8.2 17.2 Z M13.1 6.8 L15.8 6.8 L15.8 17.2 L13.1 17.2 Z";

export function recorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) if (MediaRecorder.isTypeSupported(type)) return type;
  return "";
}
export const canRecord = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!recorderMime();

// The recording onto the note's page; its file id.
export async function uploadRecording(pageId: string, blob: Blob) {
  const type = blob.type || recorderMime();
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("pageId", pageId);
  form.append("file", new File([blob], `voice-note.${ext}`, { type: type.split(";")[0] }));
  const response = await fetch("/api/upload", { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Upload failed");
  return String(body.id);
}

// 40 peaks from the levels measured while recording (the loudest per slice).
function toPeaks(levels: number[]) {
  if (!levels.length) return Array.from({ length: PEAKS }, () => 0.14);
  const top = Math.max(...levels, 0.05);
  return Array.from({ length: PEAKS }, (_, i) => {
    const slice = levels.slice(Math.floor((i * levels.length) / PEAKS), Math.max(Math.floor(((i + 1) * levels.length) / PEAKS), Math.floor((i * levels.length) / PEAKS) + 1));
    return Math.round(clamp(Math.max(...slice) / top, 0.14, 1) * 1000) / 1000;
  });
}

export function VoiceRecorder({ onDone, onCancel }: { onDone: (blob: Blob, seconds: number, peaks: number[]) => void; onCancel: () => void }) {
  const t = useT();
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState<number[]>(() => Array.from({ length: 28 }, () => 0.1));
  const [failed, setFailed] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const levels = useRef<number[]>([]);
  const started = useRef(0);
  const keep = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let frame = 0;
    let stopped = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (stopped) return stream.getTracks().forEach((track) => track.stop());
        const mime = recorderMime();
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorder.current = rec;
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.onstop = () => {
          const length = (performance.now() - started.current) / 1000;
          if (keep.current) done.current(new Blob(chunks.current, { type: rec.mimeType || mime }), Math.round(length * 10) / 10, toPeaks(levels.current));
        };
        audio = new AudioContext();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        audio.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let last = 0;
        started.current = performance.now();
        rec.start(1000);
        const tick = (now: number) => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const level = Math.sqrt(sum / data.length);
          if (now - last > 90) {
            last = now;
            levels.current.push(level);
            setLive((bars) => [...bars.slice(1), clamp(level * 3.2, 0.1, 1)]);
            const elapsed = (now - started.current) / 1000;
            setSeconds(elapsed);
            if (elapsed >= MAX_SECONDS) return finish(true);
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        setFailed(e instanceof DOMException && e.name === "NotAllowedError" ? t("Das Mikrofon ist nicht erlaubt.", "The microphone is not allowed.") : t("Aufnahme nicht möglich.", "Recording is not possible."));
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback((save: boolean) => {
    keep.current = save;
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (!save) onCancel();
  }, [onCancel]);

  if (failed)
    return (
      <div className="db-voice is-recording is-failed" role="status">
        <Mic size={16} aria-hidden />
        <span>{failed}</span>
        <button type="button" className="db-voice-small" onClick={onCancel} aria-label={t("Schließen", "Close")}>
          <X size={15} aria-hidden />
        </button>
      </div>
    );
  return (
    <div className="db-voice is-recording" role="group" aria-label={t("Sprachnotiz wird aufgenommen", "Recording a voice note")}>
      <span className="db-voice-rec" aria-hidden />
      <div className="db-voice-bars is-live" aria-hidden>
        {live.map((v, i) => (
          <span key={i} style={{ height: `${Math.round(v * 68)}%` }} />
        ))}
      </div>
      <span className="db-voice-time" role="timer">
        {clock(seconds)}
      </span>
      <button type="button" className="db-voice-small" onClick={() => finish(false)} aria-label={t("Verwerfen", "Discard")} title={t("Verwerfen", "Discard")}>
        <X size={15} aria-hidden />
      </button>
      <button type="button" className="db-voice-small is-keep" onClick={() => finish(true)} aria-label={t("Behalten", "Keep")} title={t("Behalten", "Keep")}>
        <Check size={15} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}

// The lights' sizes (× the pill's height), strength, lap time and start.
const BLOBS = [
  { size: 2, alpha: 0.5, lap: 11, offset: 0.04, pulse: 0.12 },
  { size: 1.5, alpha: 0.4, lap: 17, offset: 0.19, pulse: 0.14 },
  { size: 2.3, alpha: 0.45, lap: 23, offset: 0.47, pulse: 0.1 },
  { size: 1.2, alpha: 0.35, lap: 13, offset: 0.71, pulse: 0.16 },
];
// A point on the pill's outline: top edge, right cap, bottom edge, left cap.
function pointOnPill(distance: number, width: number, height: number) {
  const radius = height / 2,
    straight = Math.max(0, width - height),
    arc = Math.PI * radius;
  let d = distance % (2 * straight + 2 * arc);
  if (d < 0) d += 2 * straight + 2 * arc;
  if (d < straight) return [radius + d, 0];
  d -= straight;
  if (d < arc) {
    const a = -Math.PI / 2 + d / radius;
    return [width - radius + radius * Math.cos(a), radius + radius * Math.sin(a)];
  }
  d -= arc;
  if (d < straight) return [width - radius - d, height];
  d -= straight;
  const a = Math.PI / 2 + d / radius;
  return [radius + radius * Math.cos(a), radius + radius * Math.sin(a)];
}

export function VoiceNotePlayer({ audio, label }: { audio: VoiceAudio; label: string }) {
  const t = useT();
  const el = useRef<HTMLAudioElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const lights = useRef<(HTMLSpanElement | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [total, setTotal] = useState(audio.seconds);
  const scrubbing = useRef(false);
  const peaks = useMemo(() => (audio.peaks.length ? audio.peaks : Array.from({ length: PEAKS }, () => 0.3)), [audio.peaks]);
  const setProgress = (ratio: number) => pill.current?.style.setProperty("--progress", String(clamp(ratio)));

  // Progress while playing; the end goes back to the start.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const a = el.current;
      if (!a) return;
      setProgress(total ? a.currentTime / total : 0);
      setElapsed(Math.floor(a.currentTime));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);

  // The orbiting lights: they spin up while playing and coast to a stop.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0,
      last = performance.now(),
      rate = 0,
      time = 6.2;
    const loop = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      rate += ((playing ? 1 : 0) - rate) * (1 - Math.exp(-delta / 0.45));
      time += delta * rate;
      const box = pill.current;
      if (box) {
        const w = box.offsetWidth,
          h = box.offsetHeight,
          perimeter = 2 * Math.max(0, w - h) + Math.PI * h;
        BLOBS.forEach((blob, i) => {
          const node = lights.current[i];
          if (!node) return;
          const [x, y] = pointOnPill((blob.offset + time / blob.lap) * perimeter, w, h);
          node.style.transform = `translate(${x}px, ${y}px) scale(${1 + Math.sin(time * 0.6 + blob.offset * Math.PI * 2) * blob.pulse})`;
        });
      }
      if (playing || rate > 0.002) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = () => {
    const a = el.current;
    if (!a) return;
    if (playing) return a.pause();
    a.playbackRate = speed;
    void a.play().catch(() => setPlaying(false));
  };
  const seek = (ratio: number) => {
    const a = el.current;
    if (!a || !total) return;
    a.currentTime = clamp(ratio) * total;
    setProgress(clamp(ratio));
    setElapsed(Math.floor(a.currentTime));
  };
  const scrub = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (box?.width) seek((clientX - box.left) / box.width);
  };

  return (
    <div ref={pill} className={`db-voice${playing ? " is-playing" : ""}`} role="group" aria-label={label}>
      <span className="db-voice-glow" aria-hidden>
        <span className="db-voice-field">
          <span className="db-voice-wash" />
          {BLOBS.map((blob, i) => (
            <span
              key={i}
              ref={(node) => {
                lights.current[i] = node;
              }}
              className="db-voice-light"
              style={{ width: `calc(var(--voice-h) * ${blob.size})`, height: `calc(var(--voice-h) * ${blob.size})`, opacity: blob.alpha }}
            />
          ))}
        </span>
      </span>
      <button type="button" className="db-voice-play" onClick={toggle} aria-label={playing ? t("Sprachnotiz anhalten", "Pause voice note") : t("Sprachnotiz abspielen", "Play voice note")}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={playing ? PAUSE : PLAY} />
        </svg>
      </button>
      <div
        ref={track}
        className="db-voice-track"
        role="slider"
        tabIndex={0}
        aria-label={t("Position", "Seek")}
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={elapsed}
        aria-valuetext={t(`${clock(elapsed)} von ${clock(total)}`, `${clock(elapsed)} of ${clock(total)}`)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubbing.current = true;
          scrub(e.clientX);
        }}
        onPointerMove={(e) => scrubbing.current && scrub(e.clientX)}
        onPointerUp={() => (scrubbing.current = false)}
        onPointerCancel={() => (scrubbing.current = false)}
        onKeyDown={(e) => {
          const at = el.current?.currentTime ?? 0;
          const to = { ArrowLeft: at - 5, ArrowRight: at + 5, Home: 0, End: total }[e.key];
          if (to === undefined || !total) return;
          e.preventDefault();
          seek(to / total);
        }}
      >
        <div className="db-voice-bars" aria-hidden>
          {peaks.map((p, i) => (
            <span key={i} style={{ height: `${(p * 68).toFixed(1)}%` }} />
          ))}
        </div>
        <div className="db-voice-bars is-played" aria-hidden>
          {peaks.map((p, i) => (
            <span key={i} style={{ height: `${(p * 68).toFixed(1)}%` }} />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="db-voice-time"
        onClick={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
          setSpeed(next);
          if (el.current) el.current.playbackRate = next;
        }}
        aria-label={t(`Geschwindigkeit ${speed}×, zum Ändern drücken`, `Playback speed ${speed}×, press to change`)}
      >
        {clock(total - elapsed)}
        {speed !== 1 && <span className="db-voice-speed">{speed}×</span>}
      </button>
      <audio
        ref={el}
        src={`/api/files/${audio.file}`}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0 && setTotal(e.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false);
          seek(0);
        }}
      />
    </div>
  );
}

// Keeps a recording on a note: onto its page, then into the note.
export async function attachRecording(store: { update: (id: string, patch: { audio: VoiceAudio }) => Promise<void> }, note: { id: string; pageId: string | null }, blob: Blob, seconds: number, peaks: number[]) {
  if (!note.pageId) throw new Error("No page");
  const file = await uploadRecording(note.pageId, blob);
  await store.update(note.id, { audio: { file, seconds, peaks } });
}
