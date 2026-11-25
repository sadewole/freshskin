/**
 * The scan state machine. The same edges are enforced at the database by a guarded UPDATE
 * (`WHERE status = $from`), so two workers cannot both finalise one scan: the second gets
 * zero rows, not a corrupted record.
 */

export type ScanState = 'queued' | 'processing' | 'complete' | 'failed' | 'low_confidence';
export type ScanEvent = 'start' | 'complete' | 'low_confidence' | 'fail';

const NEXT: Readonly<Record<ScanState, Partial<Record<ScanEvent, ScanState>>>> = {
  queued: { start: 'processing', fail: 'failed' },
  processing: { complete: 'complete', low_confidence: 'low_confidence', fail: 'failed' },
  complete: {},
  failed: {},
  low_confidence: {},
};

export class IllegalTransition extends Error {
  constructor(
    readonly from: ScanState,
    readonly event: ScanEvent,
  ) {
    super(`cannot ${event} a scan that is ${from}`);
    this.name = 'IllegalTransition';
  }
}

export function advance(from: ScanState, event: ScanEvent): ScanState {
  const next = NEXT[from][event];
  if (next === undefined) throw new IllegalTransition(from, event);
  return next;
}

export function isTerminal(state: ScanState): boolean {
  return Object.keys(NEXT[state]).length === 0;
}

/** Terminal states are final; a late event is a replay, not an error, at the service layer. */
export function isReplay(state: ScanState, event: ScanEvent): boolean {
  return isTerminal(state) && NEXT[state][event] === undefined;
}
