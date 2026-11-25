// -----------------------------------------------------------------------------
// The watcher: reads Azure DevOps on a loop.
//
// Each round reads the user of the token, the projects and every followed
// project (see azdo-api.js). Each round leaves a snapshot per project, the
// single source the devices, the widgets and the scene actions read from,
// and the transitions since the previous round (see tracker.js).
//
// The loop is a chain of timeouts, not an interval: a slow round never
// overlaps the next one, and a new poll interval takes effect at once. When
// Azure DevOps asks to slow down (Retry-After, 429), the next round waits.
// -----------------------------------------------------------------------------

import { diffProject, mergeSnapshot } from './tracker.js';
import { readProject } from './read.js';

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.azdo - The Azure DevOps client.
 * @param {Function} options.getProjects - `() => string[]` (configured names, empty for all).
 * @param {Function} options.getBaseUrl - `() => string|null`.
 * @param {Function} options.isEnabled - `() => boolean` (an organization and a token are set).
 * @param {Function} options.getIntervalMs - `() => number`.
 * @param {Function} [options.onRound] - `(round)` after every successful read.
 * @param {Function} [options.onError] - `(error)` after every failed read.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ azdo, getProjects: () => ['Web'], … });
 */
function createWatcher({
  azdo,
  getProjects,
  getBaseUrl,
  isEnabled,
  getIntervalMs,
  onRound = () => {},
  onError = () => {},
  now = () => Date.now(),
  logger = console,
}) {
  // project GUID -> kept snapshot, in the followed order
  let snapshots = new Map();
  let user = null;
  let fetchedAt = null;
  let timer = null;
  let running = false;
  let inFlight = null;
  let retryAt = null;

  /**
   * @description Read Azure DevOps once, update the snapshots, report the round.
   * @returns {Promise<object>} The round.
   * @throws {Error} When the read fails (after onError).
   */
  async function read() {
    let answer;
    try {
      answer = await azdo.round(getProjects());
    } catch (err) {
      if (err.kind === 'rate_limit' && Number.isFinite(err.resetAt)) {
        retryAt = err.resetAt;
      }
      await onError(err);
      throw err;
    }
    retryAt = null;
    const time = now();
    const context = { baseUrl: getBaseUrl(), userId: answer.user?.id ?? null };
    const next = new Map();
    const projects = [];
    for (const raw of answer.projects) {
      const snapshot = readProject(raw, context);
      if (!snapshot) {
        continue;
      }
      const previous = snapshots.get(snapshot.id) ?? null;
      const events = diffProject(previous, snapshot);
      const kept = mergeSnapshot(previous, snapshot);
      const { signature: previousSignature } = previous ?? {};
      const signature = JSON.stringify({ ...kept, highestPullRequest: 0 });
      next.set(snapshot.id, { ...kept, fetchedAt: time, signature });
      projects.push({
        snapshot: next.get(snapshot.id),
        events,
        changed: previousSignature !== signature,
      });
    }
    snapshots = next;
    user = answer.user ?? user;
    fetchedAt = time;
    const round = {
      projects,
      user,
      missing: answer.missing ?? [],
      refused: answer.refused ?? [],
      total: answer.total ?? projects.length,
    };
    await onRound(round);
    return round;
  }

  /**
   * @description One round now, shared with a round already running.
   * @returns {Promise<object|null>} The round, null when disabled or failed.
   */
  function round() {
    if (!isEnabled()) {
      return Promise.resolve(null);
    }
    if (!inFlight) {
      inFlight = read()
        .catch((err) => {
          logger.warn(`Azure DevOps read failed: ${err.message}`);
          return null;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  /**
   * @description Delay before the next round.
   * @returns {number} In ms.
   */
  function nextDelay() {
    const interval = getIntervalMs();
    const until = Math.max(retryAt ?? 0, azdo.throttledUntil?.() ?? 0);
    if (until > now()) {
      return Math.max(interval, until - now() + 5000);
    }
    return interval;
  }

  /**
   * @description Schedule the next round.
   */
  function schedule() {
    clearTimeout(timer);
    if (!running) {
      return;
    }
    timer = setTimeout(async () => {
      await round();
      schedule();
    }, nextDelay());
    timer.unref?.();
  }

  return {
    /** Start the loop: one round per interval (the caller reads once first). */
    start() {
      if (running) {
        return;
      }
      running = true;
      schedule();
    },
    /** Stop the loop. */
    stop() {
      running = false;
      clearTimeout(timer);
    },
    /** Apply a new interval at once. */
    reschedule() {
      schedule();
    },
    round,
    nextDelay,
    /**
     * @description A fresh enough snapshot of a project, read now otherwise.
     * @param {string} id - The project GUID.
     * @param {number} maxAgeMs - Accepted age.
     * @returns {Promise<object|null>} The snapshot.
     */
    async get(id, maxAgeMs) {
      const cached = snapshots.get(id);
      if (cached && now() - cached.fetchedAt <= maxAgeMs) {
        return cached;
      }
      await round();
      return snapshots.get(id) ?? null;
    },
    /** @returns {object[]} The snapshots of the last round, in the followed order. */
    projects: () => [...snapshots.values()],
    /** @returns {object|null} The user of the token. */
    user: () => user,
    /** @returns {number|null} When Azure DevOps was last read, in ms. */
    fetchedAt: () => fetchedAt,
    /** Forget everything (new organization or token: maybe another user). */
    reset() {
      snapshots = new Map();
      user = null;
      fetchedAt = null;
    },
  };
}

export { createWatcher };
