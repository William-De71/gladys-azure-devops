// -----------------------------------------------------------------------------
// The devices of the Azure DevOps integration, offered on the Discovery screen.
//
// One device per followed project, "Azure DevOps <project>":
//   - counters (counter-sensor / integer): active pull requests, pull
//     requests waiting for the vote of the token's user, open work items
//     assigned to them, pipelines whose last run failed, running builds;
//   - texts (text / text): the last finished run ("CI #20261125.3: Failed",
//     in the language of the integration) and the newest active pull request.
//
// External ids are built on the project GUID: renaming the project keeps the
// device. The name in the device params is only informative.
//
// The integration reads Azure DevOps on its own timer (every 120 s by
// default, beyond the 60 s Gladys polls at most), so `should_poll` is false.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { countersOf } from './read.js';
import { t } from './i18n.js';

const DEVICE_TYPES = { PROJECT: 'project' };

// Bounds of the counters: far beyond any project.
const MAX_COUNT = 100000;
// A text state is a short label; longer ones are cut with an ellipsis.
const MAX_TEXT = 200;

const COUNTERS = [
  {
    key: 'active_pull_requests',
    text: 'featureActivePullRequests',
    read: (counters) => counters.activePullRequests,
  },
  {
    key: 'pull_requests_to_review',
    text: 'featureToReview',
    read: (counters) => counters.toReview,
  },
  { key: 'my_work_items', text: 'featureMyWorkItems', read: (counters) => counters.myWorkItems },
  {
    key: 'failed_pipelines',
    text: 'featureFailedPipelines',
    read: (counters) => counters.failedPipelines,
  },
  {
    key: 'running_builds',
    text: 'featureRunningBuilds',
    read: (counters) => counters.runningBuilds,
  },
];

const TEXTS = [
  {
    key: 'last_build',
    text: 'featureLastBuild',
    read: (project, language) => buildLabel(project.builds?.[0], language),
  },
  {
    key: 'latest_pull_request',
    text: 'featureLatestPullRequest',
    read: (project) => pullRequestLabel(project.pullRequests?.[0]),
  },
];

const clip = (value, max = MAX_TEXT) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * @description "CI #20261125.3: Failed" for a finished run.
 * @param {object|undefined} build - The run.
 * @param {string} language - The language of the result.
 * @returns {string|null} The label.
 */
function buildLabel(build, language) {
  if (!build) {
    return null;
  }
  const result = build.result ? t(`result_${build.result}`, language) : build.status;
  return clip(`${build.pipeline} #${build.number}: ${result}`);
}

/**
 * @description "!12 Title" for a pull request.
 * @param {object|undefined} pull - The pull request.
 * @returns {string|null} The label.
 */
function pullRequestLabel(pull) {
  return pull ? clip(`!${pull.id} ${pull.title}`) : null;
}

/**
 * @description The external ids of a project.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The project GUID, lowercase.
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, 'project', '6ce954b1-…').device; // -> 'ext:azure-devops:project:6ce954b1-…'
 */
function idsOf(gladys, type, id) {
  return gladys.externalIds(type, String(id).toLowerCase());
}

/**
 * @description The project GUID a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @returns {string|null} The GUID, lowercase.
 * @example
 * idFromExternalId('ext:azure-devops:project:6ce954b1-ce1f-45d1-b94d-e6bf2464ba2c:my_work_items');
 */
function idFromExternalId(externalId) {
  const match =
    /:project:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?::[a-z_]+)?$/i.exec(
      String(externalId ?? ''),
    );
  return match ? match[1].toLowerCase() : null;
}

const counter = (ids, language, spec) => ({
  name: t(spec.text, language),
  external_id: ids.feature(spec.key),
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: MAX_COUNT,
});

const label = (ids, language, spec) => ({
  name: t(spec.text, language),
  external_id: ids.feature(spec.key),
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
});

/**
 * @description The device of a project.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} project - The project snapshot.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 * @example
 * buildProjectDevice(gladys, snapshot, 'fr');
 */
function buildProjectDevice(gladys, project, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.PROJECT, project.id);
  return {
    name: t('projectDeviceName', language, { project: project.name }),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'AZURE_DEVOPS_PROJECT', value: project.name }],
    features: [
      ...COUNTERS.map((spec) => counter(ids, language, spec)),
      ...TEXTS.map((spec) => label(ids, language, spec)),
    ],
  };
}

/**
 * @description The states of a project. An unknown value is omitted, never
 * published as 0 or an empty text.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} project - The project snapshot.
 * @param {string} [language] - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildProjectStates(gladys, project, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.PROJECT, project.id);
  const counters = countersOf(project);
  const states = [];
  COUNTERS.forEach((spec) => {
    const value = spec.read(counters);
    if (Number.isInteger(value)) {
      states.push({
        device_feature_external_id: ids.feature(spec.key),
        state: Math.min(value, MAX_COUNT),
      });
    }
  });
  TEXTS.forEach((spec) => {
    const value = spec.read(project, language);
    if (value) {
      states.push({ device_feature_external_id: ids.feature(spec.key), text: value });
    }
  });
  return states;
}

export {
  DEVICE_TYPES,
  MAX_COUNT,
  COUNTERS,
  TEXTS,
  idsOf,
  idFromExternalId,
  buildLabel,
  pullRequestLabel,
  buildProjectDevice,
  buildProjectStates,
};
