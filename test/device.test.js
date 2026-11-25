// The discovered device and its states, checked against the SDK constants
// and the host API rules (section 2 bis of the integration guide).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

import {
  buildProjectDevice,
  buildProjectStates,
  idFromExternalId,
  buildLabel,
} from '../src/device.js';
import { readProject } from '../src/read.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, rawProject, BASE_URL, PROJECT_ID, USER_ID } from './helpers/fixtures.js';

const project = readProject(rawProject(), { baseUrl: BASE_URL, userId: USER_ID });

test('one device per project, every feature complete and read-only, no Gladys polling', () => {
  const device = buildProjectDevice(fakeGladys, project, 'fr');
  assert.equal(device.name, 'Azure DevOps Web');
  assert.equal(device.external_id, `ext:azure-devops:project:${PROJECT_ID}`);
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.deepEqual(device.params, [{ name: 'AZURE_DEVOPS_PROJECT', value: 'Web' }]);
  const pairs = new Set([
    `${DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR}/${DEVICE_FEATURE_TYPES.SENSOR.INTEGER}`,
    `${DEVICE_FEATURE_CATEGORIES.TEXT}/${DEVICE_FEATURE_TYPES.TEXT.TEXT}`,
  ]);
  for (const feature of device.features) {
    for (const key of ['name', 'external_id', 'category', 'type', 'min', 'max']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    assert.equal(feature.read_only, true);
    assert.equal(feature.has_feedback, false);
    assert.ok(pairs.has(`${feature.category}/${feature.type}`), feature.external_id);
    assert.ok(feature.external_id.startsWith(`${device.external_id}:`));
  }
  assert.equal(new Set(device.features.map((f) => f.external_id)).size, device.features.length);
  for (const language of LANGUAGES) {
    const names = buildProjectDevice(fakeGladys, project, language).features.map((f) => f.name);
    assert.equal(new Set(names).size, names.length, language);
  }
});

test('states: counters and labels; an unknown part publishes nothing', () => {
  const states = Object.fromEntries(
    buildProjectStates(fakeGladys, project, 'en').map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.state ?? state.text,
    ]),
  );
  assert.deepEqual(states, {
    active_pull_requests: 3,
    pull_requests_to_review: 1,
    my_work_items: 2,
    failed_pipelines: 1,
    running_builds: 1,
    last_build: 'CI #20261125.4: Failed',
    latest_pull_request: '!41 Add the login page',
  });
  assert.equal(buildLabel(project.builds[0], 'de'), 'CI #20261125.4: Fehlgeschlagen');
  const blind = readProject(
    { ...rawProject(), activePullRequests: null, workItems: null },
    { baseUrl: BASE_URL, userId: USER_ID },
  );
  const keys = buildProjectStates(fakeGladys, blind).map((s) =>
    s.device_feature_external_id.split(':').pop(),
  );
  assert.deepEqual(keys, ['failed_pipelines', 'running_builds', 'last_build']);
});

test('the project GUID is read back from a device or feature external id', () => {
  const id = `ext:azure-devops:project:${PROJECT_ID.toUpperCase()}`;
  assert.equal(idFromExternalId(id), PROJECT_ID);
  assert.equal(idFromExternalId(`${id}:my_work_items`), PROJECT_ID);
  assert.equal(idFromExternalId('ext:azure-devops:project:Web'), null);
  assert.equal(idFromExternalId(undefined), null);
});
