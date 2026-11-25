import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildProjectOutputs,
  findPipeline,
  buildRunOutputs,
  UNKNOWN,
} from '../src/scene-actions.js';
import { readProject } from '../src/read.js';
import { rawProject, rawBuild, BASE_URL, USER_ID } from './helpers/fixtures.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const outputsOf = (key) =>
  manifest.scene_actions.find((action) => action.key === key).outputs.map((o) => [o.key, o.type]);
const project = readProject(rawProject(), { baseUrl: BASE_URL, userId: USER_ID });

/**
 * @description Check outputs against the manifest.
 * @param {string} key - The action key.
 * @param {object} outputs - The outputs.
 */
function assertDeclared(key, outputs) {
  const declared = outputsOf(key);
  assert.deepEqual(Object.keys(outputs).sort(), declared.map(([name]) => name).sort());
  for (const [name, type] of declared) {
    assert.equal(typeof outputs[name], type, `${key}.${name}`);
    if (type === 'string') {
      assert.ok(outputs[name].length <= 10000);
    }
  }
}

test('get_project returns exactly its declared outputs, -1 for an unknown counter', () => {
  const outputs = buildProjectOutputs(project, 'en');
  assertDeclared('get_project', outputs);
  assert.equal(outputs.pull_requests_to_review, 1);
  assert.equal(outputs.last_build_result, 'failed');
  assert.equal(
    outputs.summary,
    'Web: 1 pull request(s) to review, 2 work item(s), 1 failed pipeline(s).',
  );
  const blind = readProject({ ...rawProject(), workItems: null }, { baseUrl: BASE_URL });
  assert.equal(buildProjectOutputs(blind, 'fr').my_work_items, UNKNOWN);
  assert.equal(buildProjectOutputs(blind, 'fr').pull_requests_to_review, UNKNOWN);
});

test('findPipeline: by id, name or folder\\name, case-insensitive; ambiguity is refused', () => {
  const pipelines = [
    { id: 12, name: 'CI', folder: '' },
    { id: 13, name: 'Deploy', folder: 'prod' },
    { id: 14, name: 'Deploy', folder: 'staging' },
  ];
  assert.equal(findPipeline(pipelines, '12').pipeline.id, 12);
  assert.equal(findPipeline(pipelines, ' ci ').pipeline.id, 12);
  assert.equal(findPipeline(pipelines, 'staging\\deploy').pipeline.id, 14);
  assert.equal(findPipeline(pipelines, '\\prod/Deploy').pipeline.id, 13);
  assert.deepEqual(findPipeline(pipelines, 'Deploy'), { pipeline: null, ambiguous: true });
  assert.deepEqual(findPipeline(pipelines, 'Nope'), { pipeline: null, ambiguous: false });
  assert.deepEqual(findPipeline(pipelines, ''), { pipeline: null, ambiguous: false });
});

test('run_pipeline returns exactly its declared outputs', () => {
  const queued = rawBuild({ id: 999, number: '20261125.9', status: 'notStarted' });
  const outputs = buildRunOutputs(project, project.pipelines[0], queued, 'fr');
  assertDeclared('run_pipeline', outputs);
  assert.equal(outputs.build_id, 999);
  assert.equal(outputs.summary, 'Exécution 20261125.9 de CI mise en file sur main (Web).');
  assert.equal(buildRunOutputs(project, project.pipelines[0], {}, 'en').build_id, UNKNOWN);
});
