import { useEffect, useRef, useState } from "react";

interface Props {
  /** shown by itself on a first visit: starts muted, since browsers block sound until a click */
  first: boolean;
  onClose: () => void;
}

/** A short video that shows what Loadout is and how to use it. */
export default function Tour({ first, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const v = video.current;
    if (v) {
      // opened with a click, the tour can play with sound; on its own it starts muted
      v.muted = first;
      setMuted(first);
      v.play().catch(() => {
        v.muted = true;
        setMuted(true);
        v.play().catch(() => undefined);
      });
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
    // runs once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unmute = () => {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    if (v.paused) v.play().catch(() => undefined);
  };

  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tour-card">
        <div className="tour-head">
          <div>
            <span className="tour-k">Quick tour · under a minute</span>
            <h2 id="tour-title">How Loadout works</h2>
          </div>
          <button ref={closeBtn} type="button" className="tour-x" onClick={onClose} aria-label="Close the tour">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="tour-video">
          <video
            ref={video}
            src="./tour.mp4"
            poster="./tour.jpg"
            playsInline
            controls
            preload="auto"
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onEnded={() => setEnded(true)}
            onPlay={() => setEnded(false)}
          />
          {muted && !ended && (
            <button type="button" className="tour-sound" onClick={unmute}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
                <path d="M11.5 5.5a3.5 3.5 0 010 5M13.5 3.5a6.3 6.3 0 010 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
              </svg>
              Sound on
            </button>
          )}
        </div>

        <div className="tour-foot">
          <p>Pick an example order or set your own cases, and Loadout builds the pallets.</p>
          <button type="button" className="tour-go" onClick={onClose}>
            Start building
          </button>
        </div>
      </div>
    </div>
  );
}
