// -----------------------------------------------------------------------------
// Scene trigger transitions: what happened in a project between two rounds.
// Pure logic, no I/O.
//
// One event per transition, never a periodic snapshot:
//   - `build_completed`         a run that finished since the previous round
//                               (succeeded, partially succeeded, failed or
//                               canceled);
//   - `pull_request_created`    an active pull request numbered above every
//                               one seen;
//   - `review_requested`        a pull request now waiting for the vote of
//                               the token's user;
//   - `pull_request_completed`  a pull request completed (merged) since the
//                               previous round;
//   - `work_item_assigned`      an open work item newly assigned to the
//                               token's user.
//
// The first round of a project is the baseline: it reports nothing, or a
// restart of the container would replay the latest runs and pull requests.
// A part that could not be read (null) reports nothing and is not a
// baseline either: its next readable round is.
// -----------------------------------------------------------------------------

const SCENE_TRIGGERS = {
  BUILD_COMPLETED: 'build_completed',
  PULL_REQUEST_CREATED: 'pull_request_created',
  REVIEW_REQUESTED: 'review_requested',
  PULL_REQUEST_COMPLETED: 'pull_request_completed',
  WORK_ITEM_ASSIGNED: 'work_item_assigned',
};

// A completed list is cut at a few items: an item older than the oldest one
// of the previous list may only have slid in from beyond the cut.
const oldestOf = (items, key) =>
  items.length === 0 ? 0 : Math.min(...items.map((item) => item[key] ?? 0));

/**
 * @description The completed runs or pull requests that were not in the
 * previous list, oldest first.
 * @param {object[]} before - The previous list.
 * @param {object[]} after - The current list.
 * @param {string} key - The time key (`finishedAt`, `closedAt`).
 * @returns {object[]} The new items.
 */
function newlyCompleted(before, after, key) {
  const known = new Set(before.map((item) => item.id));
  const oldest = oldestOf(before, key);
  return after
    .filter((item) => !known.has(item.id) && (item[key] ?? 0) >= oldest)
    .sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0));
}

/**
 * @description The highest pull request id seen in a snapshot.
 * @param {object} snapshot - The project snapshot.
 * @returns {number} The id (0 when none).
 */
function highestPullRequest(snapshot) {
  return Math.max(
    snapshot.highestPullRequest ?? 0,
    ...(snapshot.pullRequests ?? []).map((pull) => pull.id),
    ...(snapshot.completedPullRequests ?? []).map((pull) => pull.id),
  );
}

/**
 * @description What happened between two snapshots of a project.
 * @param {object|null} before - The previous snapshot (null: first round).
 * @param {object} after - The current snapshot.
 * @returns {Array<{ key: string }>} The events, each with its item.
 * @example
 * diffProject(previous, current); // -> [{ key: 'build_completed', build }]
 */
function diffProject(before, after) {
  if (!before) {
    return [];
  }
  const events = [];
  if (before.builds && after.builds) {
    newlyCompleted(before.builds, after.builds, 'finishedAt')
      .filter((build) => build.result)
      .forEach((build) => events.push({ key: SCENE_TRIGGERS.BUILD_COMPLETED, build }));
  }
  if (before.pullRequests && after.pullRequests) {
    const highest = highestPullRequest(before);
    after.pullRequests
      .filter((pull) => pull.id > highest)
      .sort((a, b) => a.id - b.id)
      .forEach((pull) => events.push({ key: SCENE_TRIGGERS.PULL_REQUEST_CREATED, pull }));
    if (before.userKnown && after.userKnown) {
      const waiting = new Set(before.pullRequests.filter((p) => p.toReview).map((p) => p.id));
      after.pullRequests
        .filter((pull) => pull.toReview && !waiting.has(pull.id))
        .sort((a, b) => a.id - b.id)
        .forEach((pull) => events.push({ key: SCENE_TRIGGERS.REVIEW_REQUESTED, pull }));
    }
  }
  if (before.completedPullRequests && after.completedPullRequests) {
    newlyCompleted(before.completedPullRequests, after.completedPullRequests, 'closedAt').forEach(
      (pull) => events.push({ key: SCENE_TRIGGERS.PULL_REQUEST_COMPLETED, pull }),
    );
  }
  if (before.workItems && after.workItems) {
    const assigned = new Set(before.workItems.map((item) => item.id));
    after.workItems
      .filter((item) => !assigned.has(item.id))
      .sort((a, b) => a.id - b.id)
      .forEach((item) => events.push({ key: SCENE_TRIGGERS.WORK_ITEM_ASSIGNED, item }));
  }
  return events;
}

/**
 * @description The snapshot to keep for the next round: the parts the round
 * could not read keep their previous value, so a passing failure neither
 * replays history nor hides what happened meanwhile.
 * @param {object|null} before - The previous kept snapshot.
 * @param {object} after - The current snapshot.
 * @returns {object} The snapshot to keep.
 */
function mergeSnapshot(before, after) {
  const kept = { ...after };
  if (before) {
    ['pipelines', 'builds', 'pullRequests', 'completedPullRequests', 'workItems'].forEach((key) => {
      if (kept[key] === null && before[key]) {
        kept[key] = before[key];
      }
    });
    if (kept.running === null) {
      kept.running = before.running;
    }
  }
  kept.highestPullRequest = Math.max(
    before ? highestPullRequest(before) : 0,
    highestPullRequest(after),
  );
  return kept;
}

export { SCENE_TRIGGERS, diffProject, mergeSnapshot };
