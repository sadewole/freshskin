import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, RefreshCw, X } from 'lucide-react';
import { motion } from 'motion/react';
import { decodeFile, processFrame, type ProcessedPhoto } from './capture';
import { ErrorNote } from '../ui/Async';
import { verdictEnter } from '../ui/motion';

type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'live' }
  | { readonly kind: 'review'; readonly photo: ProcessedPhoto }
  | { readonly kind: 'blocked'; readonly reason: 'denied' | 'none' | 'insecure' };

const BLOCKED_COPY: Record<'denied' | 'none' | 'insecure', string> = {
  denied:
    'Camera access was blocked. Allow it in the browser settings, or choose a photo from the gallery instead.',
  none: 'No camera was found on this device. Choose a photo from the gallery instead.',
  insecure: 'The camera needs a secure connection. Choose a photo from the gallery instead.',
};

const cameraSupported =
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.getUserMedia !== undefined &&
  window.isSecureContext;

/**
 * The photo half of the label scanner (PRD §13.4 step 1, §13.2 on-device gate).
 *
 * Live camera where `getUserMedia` exists, gallery upload everywhere else (PRD AC-1.4).
 * Every frame goes through `processFrame` — downscale, EXIF strip, quality gate — before it
 * is shown, so a blurry or glaring shot never reaches review; the specific retake copy names
 * the defect. The parent owns the server handoff; this component only hands back a photo the
 * gate already accepted.
 */
export function LabelCapture({
  onUsePhoto,
  sending,
}: {
  readonly onUsePhoto: (photo: ProcessedPhoto) => void;
  readonly sending: boolean;
}) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stop = (): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current !== null) videoRef.current.srcObject = null;
  };

  // A stream left running keeps the camera light on after the user leaves the tab.
  useEffect(() => () => stop(), []);

  // The video element only exists in `live` mode, so the stream attaches after it mounts.
  useEffect(() => {
    if (mode.kind === 'live' && videoRef.current !== null && streamRef.current !== null) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {
        // Autoplay with sound would reject; this stream has no audio track, so a rejection
        // here means the element is gone, not that playback failed.
      });
    }
  }, [mode]);

  const start = async (): Promise<void> => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode({ kind: 'live' });
    } catch (caught) {
      if (caught instanceof DOMException && (caught.name === 'NotAllowedError' || caught.name === 'SecurityError')) {
        setMode({ kind: 'blocked', reason: 'denied' });
      } else {
        setMode({ kind: 'blocked', reason: 'none' });
      }
    }
  };

  const capture = (): void => {
    const video = videoRef.current;
    if (video === null || video.videoWidth === 0) {
      setError(new Error('The camera is not ready yet. Give it a second and try again.'));
      return;
    }
    try {
      // Throws the specific retake copy; the live preview stays up so retry is one tap.
      const photo = processFrame(video, video.videoWidth, video.videoHeight);
      stop();
      setError(null);
      setMode({ kind: 'review', photo });
    } catch (caught) {
      setError(caught);
    }
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const { bitmap, width, height } = await decodeFile(file);
      try {
        const photo = processFrame(bitmap, width, height);
        setMode({ kind: 'review', photo });
      } catch (caught) {
        setError(caught);
      } finally {
        bitmap.close();
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const retake = async (): Promise<void> => {
    stop();
    setError(null);
    await start();
  };

  const cancel = (): void => {
    stop();
    setError(null);
    setMode({ kind: 'idle' });
  };

  return (
    <div className="card scan-capture">
      <div aria-live="polite">
        {mode.kind === 'review' ? (
          <motion.div {...verdictEnter}>
            <div className="capture-preview">
              <img src={mode.photo.dataUrl} alt="Ingredient label photo, ready to send" />
            </div>
            <p className="muted small">
              Looks readable. The photo stays on this phone until the reading pipeline is
              connected.
            </p>
            <div className="capture-actions">
              <button
                className="primary with-icon"
                disabled={sending}
                onClick={() => onUsePhoto(mode.photo)}
              >
                <Check size={16} aria-hidden="true" />
                {sending ? 'Saving…' : 'Use this photo'}
              </button>
              <button className="ghost with-icon" disabled={sending} onClick={() => void retake()}>
                <RefreshCw size={16} aria-hidden="true" />
                Retake
              </button>
            </div>
          </motion.div>
        ) : mode.kind === 'blocked' ? (
          <>
            <p className="muted">{BLOCKED_COPY[mode.reason]}</p>
            <div className="capture-actions">
              <button
                className="ghost with-icon"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={16} aria-hidden="true" />
                {busy ? 'Reading…' : 'Choose from gallery'}
              </button>
              {mode.reason === 'denied' && (
                <button className="ghost" onClick={() => void start()}>
                  Try again
                </button>
              )}
            </div>
          </>
        ) : mode.kind === 'live' ? (
          <>
            <div className="capture-frame">
              <video ref={videoRef} playsInline muted aria-label="Live camera preview" />
              <div className="capture-guide" aria-hidden="true" />
            </div>
            <p className="muted small">Fill the frame with the ingredients list, then take the photo.</p>
            <div className="capture-actions">
              <button className="primary with-icon" onClick={capture}>
                <Camera size={16} aria-hidden="true" />
                Take photo
              </button>
              <button className="ghost" onClick={cancel} aria-label="Stop camera">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Point the camera at the ingredients list, inside the frame. Photos are checked on
              this phone and never uploaded.
            </p>
            <div className="capture-actions">
              {cameraSupported && (
                <button className="primary with-icon" onClick={() => void start()}>
                  <Camera size={16} aria-hidden="true" />
                  Start camera
                </button>
              )}
              <button
                className="ghost with-icon"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={16} aria-hidden="true" />
                {busy ? 'Reading…' : 'Choose from gallery'}
              </button>
            </div>
          </>
        )}
      </div>
      {error !== null && <ErrorNote error={error} />}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
