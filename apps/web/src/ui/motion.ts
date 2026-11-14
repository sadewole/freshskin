import type { Transition, Variants } from 'motion/react';

/**
 * The shared transition language. Values mirror packages/ui/tokens.css
 * (--ease-out, --dur-fast, --dur-med) so JS-driven motion and CSS
 * transitions speak the same timing. `MotionConfig reducedMotion="user"`
 * in main.tsx handles prefers-reduced-motion — never gate here by hand.
 */

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const DUR_FAST = 0.15;
export const DUR_MED = 0.25;

const base: Transition = { duration: DUR_MED, ease: EASE };

/** View enter: one meaning (content arrived). Spread onto the tab-view wrapper. */
export const viewEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: base,
} as const;

/** Quiz steps: slide direction carries the meaning (forward/back). */
export const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 24 * dir }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: -24 * dir }),
};

export const stepTransition: Transition = { duration: DUR_MED, ease: EASE };

/** Verdict reveal: one meaning (the answer landed). */
export const verdictEnter = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: base,
} as const;
