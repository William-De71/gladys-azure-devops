// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake Azure DevOps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { SCENE_ACTIONS } from '../src/scene-actions.js';
import {
  azdoApi,
  projectData,
  rawBuild,
  rawWorkItem,
  silent,
  NOW,
  OTHER_ID,
  PROJECT_ID,
  TEST_TOKEN,
} from './helpers/fixtures.js';

const CONFIG = { organization: 'contoso', token: TEST_TOKEN, projects: 'Web, Gone' };
const DEVICE = `ext:test-integration:project:${PROJECT_ID}`;

/**
 * @description The integration, connected to a fake Gladys and a fake Azure DevOps.
 * @param {object} [options] - `{ config, fail }`.
 * @returns {Promise<object>} `{ gladys, app, state, fetch }`.
 */
async function startApp({ config = CONFIG, fail = [] } = {}) {
  const state = {
    projects: [projectData(), projectData({ id: OTHER_ID, name: 'Mobile App' })],
  };
  const fetch = azdoApi(() => state, { fail });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, { fetchImpl: fetch, now: () => NOW, logger: silent });
  await gladys.connect();
  return { gladys, app, state, fetch };
}

test('each followed project is offered, accepted by the host API checks; the status names the missing one', async (t) => {
  const { gladys, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.equal(fetch.calls.length, 9, 'user, projects, seven parts of Web');
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.external_id),
    [DEVICE],
  );
  assert.equal(devices[0].should_poll, false);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    'Connected as Ada Lovelace to contoso, 1 project(s) followed. Not found: Gone.',
  );
  assert.equal(gladys.fake.states.length, 0, 'nothing before a device exists');
});

test('creating the device publishes all its states, then only what changed, and events fire', async (t) => {
  const { gladys, app, state } = await startApp({ config: { ...CONFIG, projects: '' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.discoveredDevices.length, 2, 'every project by default');
  await gladys.fake.deviceCreated(
    gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE),
  );
  assert.equal(gladys.fake.lastState(`${DEVICE}:pull_requests_to_review`), 1);
  assert.equal(gladys.fake.lastState(`${DEVICE}:last_build`), 'CI #20261125.4: Failed');
  assert.ok(gladys.fake.widgetRefreshes.includes(WIDGETS.OVERVIEW));
  const before = gladys.fake.states.length;
  state.projects[0] = projectData({
    completed: [
      rawBuild({ id: 930, result: 'succeeded', finish: NOW + 1000 }),
      ...projectData().completed,
    ],
    workItems: [rawWorkItem({ id: 200, title: 'Ship it' })],
  });
  await app.watcher.round();
  const sent = gladys.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.deepEqual(sent.sort(), [`${DEVICE}:last_build`, `${DEVICE}:my_work_items`]);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    ['build_completed', 'work_item_assigned'],
  );
  assert.equal(gladys.fake.sceneEvents[0].data.project, DEVICE);
});

test('widgets answer from the last round, valid in the core format', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const key of Object.values(WIDGETS)) {
    const ack = await gladys.fake.widgetGet(key, { settings: { project: DEVICE }, language: 'fr' });
    assert.equal(ack.success, true, key);
    const { content } = ack.data;
    assert.deepEqual(validateWidgetContent(content), [], key);
    assert.notEqual(content.components[0].text, 'Azure DevOps n’a pas encore été lu.', key);
  }
  const overview = await gladys.fake.widgetGet(WIDGETS.OVERVIEW, { settings: {}, language: 'en' });
  assert.equal(overview.data.content.components[0].text, 'contoso');
});

test('missing settings: a clear status, widgets and actions say why, nothing is read', async (t) => {
  const { gladys, fetch } = await startApp({ config: { token: TEST_TOKEN } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(fetch.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /organization/);
  const widget = await gladys.fake.widgetGet(WIDGETS.WORK_ITEMS, { settings: {}, language: 'es' });
  assert.match(widget.data.content.components[0].text, /organización/);
  const tested = await gladys.fake.action('test_connection', {});
  assert.match(JSON.stringify(tested.data), /organization/);
  const action = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_PROJECT, {});
  assert.equal(action.success, false);
  assert.match(action.error, /not configured/);
});

test('a refused token or a missing scope gives the status that says what to fix', async (t) => {
  const refused = await startApp({ config: { ...CONFIG, token: 'wrong' } });
  t.after(() => refused.gladys.fake.shutdown());
  assert.equal(refused.gladys.fake.connectionStatus.connected, false);
  assert.match(refused.gladys.fake.connectionStatus.message.fr, /a refusé le jeton/);
  const scoped = await startApp({ fail: [[/wit\/wiql/, 401]] });
  t.after(() => scoped.gladys.fake.shutdown());
  assert.match(
    scoped.gladys.fake.connectionStatus.message.en,
    /Scopes missing on the token: Work Items \(Read\)\.$/,
  );
  const answer = JSON.stringify((await scoped.gladys.fake.action('test_connection', {})).data);
  assert.match(answer, /1 von 2 Projekt/);
  assert.match(answer, /Work Items \(Read\)/);
});

test('scene actions: read a project, run a pipeline by name on a branch', async (t) => {
  const { gladys, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const read = (await gladys.fake.sceneAction(SCENE_ACTIONS.GET_PROJECT, { project: DEVICE })).data
    .outputs;
  assert.equal(read.project_name, 'Web');
  assert.equal(read.failed_pipelines, 1);
  const ran = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_PIPELINE, {
    project: DEVICE,
    pipeline: 'deploy',
    branch: 'main',
  });
  const run = ran.data.outputs;
  assert.equal(run.pipeline, 'Deploy');
  assert.equal(run.build_number, '20261125.9');
  assert.deepEqual(fetch.calls.at(-1).body, {
    definition: { id: 13 },
    sourceBranch: 'refs/heads/main',
  });
  const refused = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_PIPELINE, {
    project: DEVICE,
    pipeline: 'Nope',
  });
  assert.equal(refused.success, false);
  assert.match(refused.error, /No pipeline "Nope" in Web/);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'an action never fires a scene event');
});
