import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffProject, mergeSnapshot, SCENE_TRIGGERS } from '../src/tracker.js';
import { readProject } from '../src/read.js';
import {
  rawProject,
  rawBuild,
  rawPullRequest,
  rawWorkItem,
  projectData,
  BASE_URL,
  NOW,
  USER_ID,
} from './helpers/fixtures.js';

const read = (data, userId = USER_ID) =>
  readProject(rawProject(data), { baseUrl: BASE_URL, userId });
const keys = (events) => events.map((event) => event.key);
const base = projectData();

test('the first round is a baseline; the same data reports nothing', () => {
  assert.deepEqual(diffProject(null, read()), []);
  assert.deepEqual(diffProject(read(), read()), []);
});

test('a finished run, oldest first; a run older than the list cut is not news', () => {
  const after = read({
    completed: [
      rawBuild({ id: 903, result: 'succeeded', finish: NOW + 60000 }),
      rawBuild({ id: 902, result: 'canceled', finish: NOW }),
      ...base.completed,
    ],
  });
  const events = diffProject(read(), after);
  assert.deepEqual(
    events.map((event) => [event.key, event.build.id, event.build.result]),
    [
      ['build_completed', 902, 'canceled'],
      ['build_completed', 903, 'succeeded'],
    ],
  );
  const slid = read({
    completed: [...base.completed, rawBuild({ id: 800, finish: NOW - 10 * 3600000 })],
  });
  assert.deepEqual(diffProject(read(), slid), [], 'an old run pushed into view');
});

test('pull requests: created above the highest seen, review requested, completed', () => {
  const after = read({
    active: [
      rawPullRequest({ id: 42, title: 'New one', reviewers: [] }),
      ...base.active.map((pull) =>
        pull.pullRequestId === 40
          ? pull
          : pull.pullRequestId === 39
            ? { ...pull, isDraft: false, reviewers: [{ id: USER_ID, vote: 0 }] }
            : pull,
      ),
    ],
    merged: [rawPullRequest({ id: 41, status: 'completed', closed: NOW }), ...base.merged],
  });
  const events = diffProject(read(), after);
  assert.deepEqual(keys(events), [
    SCENE_TRIGGERS.PULL_REQUEST_CREATED,
    SCENE_TRIGGERS.REVIEW_REQUESTED,
    SCENE_TRIGGERS.PULL_REQUEST_COMPLETED,
  ]);
  assert.equal(events[0].pull.id, 42);
  assert.equal(events[1].pull.id, 39, 'out of draft, the vote is now awaited');
  assert.equal(events[2].pull.id, 41);
});

test('a pull request reopened under the highest id seen is not created again', () => {
  const before = mergeSnapshot(null, read());
  const after = read({ active: [rawPullRequest({ id: 38, reviewers: [] })] });
  assert.deepEqual(
    keys(diffProject(before, after)).filter((key) => key === 'pull_request_created'),
    [],
  );
});

test('a work item newly assigned; no review event when the user is unknown', () => {
  const after = read({ workItems: [rawWorkItem({ id: 150, title: 'Fix it' }), ...base.workItems] });
  const events = diffProject(read(), after);
  assert.deepEqual(
    events.map((event) => [event.key, event.item.id]),
    [['work_item_assigned', 150]],
  );
  const anonymous = (data) => read(data, null);
  const pulls = [rawPullRequest({ id: 50, created: NOW }), ...base.active];
  assert.deepEqual(keys(diffProject(anonymous(), anonymous({ active: pulls }))), [
    'pull_request_created',
  ]);
});

test('a part not read reports nothing, keeps its previous value, then catches up', () => {
  const before = mergeSnapshot(null, read());
  const blind = readProject(
    { ...rawProject(), completedBuilds: null, workItems: null, runningBuilds: null },
    { baseUrl: BASE_URL, userId: USER_ID },
  );
  assert.deepEqual(diffProject(before, blind), []);
  const kept = mergeSnapshot(before, blind);
  assert.equal(kept.builds.length, 2);
  assert.equal(kept.workItems.length, 2);
  assert.equal(kept.running, 1);
  const later = read({
    completed: [rawBuild({ id: 910, finish: NOW + 1000, result: 'succeeded' }), ...base.completed],
  });
  assert.deepEqual(
    diffProject(kept, later).map((event) => event.build.id),
    [910],
  );
});
