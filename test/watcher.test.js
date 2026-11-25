import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWatcher } from '../src/watcher.js';
import { createAzdoClient } from '../src/azdo-api.js';
import {
  azdoApi,
  projectData,
  rawBuild,
  silent,
  BASE_URL,
  NOW,
  PROJECT_ID,
  TEST_TOKEN,
} from './helpers/fixtures.js';

/**
 * @description A watcher on a fake organization.
 * @param {object} [options] - `{ fail }`.
 * @returns {object} `{ watcher, rounds, errors, state }`.
 */
function setup({ fail = [] } = {}) {
  const state = { projects: [projectData()], time: NOW, fail };
  const azdo = createAzdoClient({
    getToken: () => TEST_TOKEN,
    getBaseUrl: () => BASE_URL,
    getUserAgent: () => 'test',
    fetch: azdoApi(() => state, { fail: state.fail }),
    now: () => state.time,
  });
  const rounds = [];
  const errors = [];
  const watcher = createWatcher({
    azdo,
    getProjects: () => [],
    getBaseUrl: () => BASE_URL,
    isEnabled: () => true,
    getIntervalMs: () => 120000,
    onRound: (round) => rounds.push(round),
    onError: (err) => errors.push(err),
    now: () => state.time,
    logger: silent,
  });
  return { watcher, rounds, errors, state };
}

test('the first round is a baseline, the next reports the transitions and changes', async () => {
  const { watcher, rounds, state } = setup();
  await watcher.round();
  assert.equal(rounds[0].projects[0].events.length, 0);
  assert.equal(rounds[0].projects[0].changed, true);
  assert.equal(rounds[0].user.name, 'Ada Lovelace');
  await watcher.round();
  assert.equal(rounds[1].projects[0].changed, false, 'same data: nothing to publish');
  state.projects = [
    projectData({
      completed: [
        rawBuild({ id: 920, result: 'succeeded', finish: NOW + 1000 }),
        ...projectData().completed,
      ],
    }),
  ];
  await watcher.round();
  assert.deepEqual(
    rounds[2].projects[0].events.map((event) => [event.key, event.build.id]),
    [['build_completed', 920]],
  );
  assert.equal(rounds[2].projects[0].changed, true);
  assert.equal(watcher.projects()[0].id, PROJECT_ID);
});

test('rounds are shared, snapshots reused while fresh, everything forgotten on reset', async () => {
  const { watcher, rounds, state } = setup();
  await Promise.all([watcher.round(), watcher.round()]);
  assert.equal(rounds.length, 1);
  assert.ok(await watcher.get(PROJECT_ID, 60000));
  assert.equal(rounds.length, 1);
  state.time += 120000;
  await watcher.get(PROJECT_ID, 60000);
  assert.equal(rounds.length, 2);
  watcher.reset();
  assert.deepEqual(watcher.projects(), []);
  assert.equal(watcher.fetchedAt(), null);
});

test('a failed round reports its error and keeps the snapshots; a 429 delays the next', async () => {
  const { watcher, errors, state } = setup();
  await watcher.round();
  state.fail.push([/connectionData/, 429, { 'Retry-After': '600' }]);
  assert.equal(await watcher.round(), null);
  assert.equal(errors[0].kind, 'rate_limit');
  assert.equal(watcher.projects().length, 1);
  assert.equal(watcher.nextDelay(), 605000);
});
