// -----------------------------------------------------------------------------
// Scene events of the integration.
//
// The tracker says what happened; this module writes the flat `data` of the
// event the core matches against the scene triggers. Every event carries:
//   - `project`       the device external id of the project: the value of the
//                     "Project" filter (a `source: "devices"` select);
//   - `project_name`  the project name, readable by the actions;
//   - `summary`       a sentence ready to put in a message;
// plus the fields of its kind. Values are scalars, texts cut at 1,000
// characters. Filters (`result`, `pipeline`, `branch`, `repository`,
// `target_branch`, `work_item_type`) are compared by equality by the core:
// they carry the value as Azure DevOps shows it.
// -----------------------------------------------------------------------------

import { SCENE_TRIGGERS } from './tracker.js';
import { RESULTS } from './read.js';
import { DEVICE_TYPES, idsOf } from './device.js';
import { t } from './i18n.js';

const MAX_TEXT = 1000;
const BUILD_RESULTS = RESULTS;

const clip = (value) => String(value ?? '').slice(0, MAX_TEXT);

/**
 * @description The variables of a pull request event.
 * @param {object} pull - The pull request.
 * @returns {object} The variables.
 */
function pullRequestData(pull) {
  return {
    repository: clip(pull.repository),
    number: pull.id,
    title: clip(pull.title),
    author: clip(pull.author),
    target_branch: clip(pull.target),
    url: clip(pull.url),
  };
}

/**
 * @description The event of a transition.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} project - The project snapshot.
 * @param {object} event - From diffProject.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 * @example
 * const { key, data } = buildSceneEvent(gladys, project, event, 'fr');
 * await gladys.publishSceneEvent(key, data);
 */
function buildSceneEvent(gladys, project, event, language) {
  const data = {
    project: idsOf(gladys, DEVICE_TYPES.PROJECT, project.id).device,
    project_name: clip(project.name),
  };
  const values = { project: project.name };
  switch (event.key) {
    case SCENE_TRIGGERS.BUILD_COMPLETED: {
      const { build } = event;
      Object.assign(data, {
        pipeline: clip(build.pipeline),
        build_number: clip(build.number),
        result: build.result,
        branch: clip(build.branch),
        requested_by: clip(build.requestedBy),
        reason: clip(build.reason),
        url: clip(build.url),
        summary: clip(
          t(`summaryBuild_${build.result}`, language, {
            ...values,
            pipeline: build.pipeline,
            number: build.number,
            branch: build.branch,
          }),
        ),
      });
      break;
    }
    case SCENE_TRIGGERS.PULL_REQUEST_CREATED:
      Object.assign(data, pullRequestData(event.pull), {
        draft: event.pull.draft,
        summary: clip(
          t('summaryPullRequestCreated', language, {
            ...values,
            number: event.pull.id,
            title: event.pull.title,
            author: event.pull.author || '?',
          }),
        ),
      });
      break;
    case SCENE_TRIGGERS.REVIEW_REQUESTED:
      Object.assign(data, pullRequestData(event.pull), {
        summary: clip(
          t('summaryReviewRequested', language, {
            ...values,
            number: event.pull.id,
            title: event.pull.title,
            author: event.pull.author || '?',
          }),
        ),
      });
      break;
    case SCENE_TRIGGERS.PULL_REQUEST_COMPLETED:
      Object.assign(data, pullRequestData(event.pull), {
        summary: clip(
          t('summaryPullRequestCompleted', language, {
            ...values,
            number: event.pull.id,
            title: event.pull.title,
            target: event.pull.target,
          }),
        ),
      });
      break;
    case SCENE_TRIGGERS.WORK_ITEM_ASSIGNED: {
      const { item } = event;
      Object.assign(data, {
        number: item.id,
        title: clip(item.title),
        work_item_type: clip(item.type),
        state: clip(item.state),
        url: clip(item.url),
        summary: clip(
          t('summaryWorkItem', language, {
            ...values,
            type: item.type,
            number: item.id,
            title: item.title,
          }),
        ),
      });
      break;
    }
    default:
      break;
  }
  return { key: event.key, data };
}

export { BUILD_RESULTS, buildSceneEvent };
