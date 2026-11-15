import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import {
  backdropTransition,
  backdropVariants,
  sheetTransition,
  sheetVariants,
} from './motion';

interface BottomSheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Mobile bottom sheet: dimmed backdrop + slide-up panel with a grab handle. Dragging the
 * handle down past the threshold (or flinging it) dismisses; body content scrolls normally
 * everywhere else because only the handle starts the drag. Esc, backdrop tap, and the
 * close button dismiss too. Slide motion lives in `ui/motion.ts`, and `MotionConfig
 * reducedMotion="user"` in main.tsx disables it under prefers-reduced-motion.
 */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div key="sheet">
          <motion.div
            className="sheet-backdrop"
            variants={backdropVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={backdropTransition}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            variants={sheetVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={sheetTransition}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0 }}
            dragElastic={0.4}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 550) onClose();
            }}
          >
            <div
              className="sheet-grab-zone"
              onPointerDown={(event) => controls.start(event)}
            >
              <span className="sheet-grabber" aria-hidden="true" />
            </div>
            <div className="sheet-head">
              <h2 className="sheet-title">{title}</h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
