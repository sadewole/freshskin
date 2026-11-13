import { appPool } from './client.js';
import { systemPool } from './system.js';

let closed = false;

/**
 * Closes both pools. Test suites and jobs import this module; request-path modules never do,
 * because importing it would pull the system credentials into the app graph.
 */
export async function closePools(): Promise<void> {
  if (closed) return;
  closed = true;
  await Promise.all([appPool.end(), systemPool.end()]);
}
