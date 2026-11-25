import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSceneEvent } from '../src/events.js';
import { diffProject } from '../src/tracker.js';
import { readProject } from '../src/read.js';
import { LANGUAGES } from '../src/i18n.js';
import {
  fakeGladys,
  rawProject,
  rawBuild,
  rawPullRequest,
  rawWorkItem,
  projectData,
  BASE_URL,
  NOW,
  PROJECT_ID,
  USER_ID,
} from './helpers/fixtures.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const triggers = new Map(manifest.scene_triggers.map((trigger) => [trigger.key, trigger]));
const read = (data) => readProject(rawProject(data), { baseUrl: BASE_URL, userId: USER_ID });
const base = projectData();

/**
 * @description One event of each kind, from two rounds.
 * @returns {Array<object>} The events.
 */
function everyEvent() {
  const after = read({
    completed: base.completed.length
      ? [rawBuild({ id: 950, result: 'partiallySucceeded', finish: NOW + 1000 }), ...base.completed]
      : [],
    active: [rawPullRequest({ id: 60, title: 'Review me', created: NOW }), ...base.active],
    merged: [rawPullRequest({ id: 41, status: 'completed', closed: NOW }), ...base.merged],
    workItems: [rawWorkItem({ id: 170, type: 'Task', title: 'Write the docs' }), ...base.workItems],
  });
  return diffProject(read(), after);
}

test('every trigger is fired, with exactly the variables of the manifest plus its filters', () => {
  const events = everyEvent();
  assert.deepEqual(
    [...new Set(events.map((event) => event.key))].sort(),
    [...triggers.keys()].sort(),
  );
  const project = read();
  for (const event of events) {
    const { key, data } = buildSceneEvent(fakeGladys, project, event, 'en');
    const trigger = triggers.get(key);
    const expected = new Set([
      ...trigger.variables.map((variable) => variable.key),
      ...trigger.fields.map((field) => field.key),
    ]);
    assert.deepEqual(Object.keys(data).sort(), [...expected].sort(), key);
    assert.equal(data.project, `ext:azure-devops:project:${PROJECT_ID}`);
    assert.ok(Object.keys(data).length <= 30);
    for (const value of Object.values(data)) {
      assert.ok(
        value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          (typeof value === 'string' && value.length <= 1000),
        `${key}: ${value}`,
      );
    }
    for (const variable of trigger.variables) {
      assert.equal(typeof data[variable.key], variable.type, `${key}.${variable.key}`);
    }
  }
});

test('the filters carry the values Azure DevOps shows; summaries in every language', () => {
  const events = everyEvent();
  const project = read();
  const build = buildSceneEvent(fakeGladys, project, events[0], 'en');
  assert.equal(build.key, 'build_completed');
  assert.deepEqual(
    [build.data.result, build.data.pipeline, build.data.branch, build.data.build_number],
    ['partiallySucceeded', 'CI', 'main', '20261125.4'],
  );
  assert.equal(build.data.summary, 'CI #20261125.4 partially succeeded on main (Web).');
  const options = triggers
    .get('build_completed')
    .fields.find((field) => field.key === 'result')
    .options.map((option) => option.value);
  assert.ok(options.includes(build.data.result));
  for (const language of LANGUAGES) {
    for (const event of events) {
      const { data } = buildSceneEvent(fakeGladys, project, event, language);
      assert.ok(data.summary.length > 10 && !/\{\w+\}/.test(data.summary), `${language}`);
    }
  }
  const work = buildSceneEvent(
    fakeGladys,
    project,
    events.find((event) => event.key === 'work_item_assigned'),
    'fr',
  );
  assert.equal(work.data.summary, 'Task n° 170 vous est assigné dans Web : Write the docs.');
  assert.equal(work.data.work_item_type, 'Task');
});
