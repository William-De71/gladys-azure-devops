// -----------------------------------------------------------------------------
// Scene actions of the integration.
//
//   - `get_project`   the counters and latest items of a project, as outputs
//                     a scene can put in a message or compare ("send me the
//                     pull requests to review every morning");
//   - `run_pipeline`  queue a run of a pipeline, on a branch or its default
//                     one (scope Build: read & execute). Azure DevOps queues
//                     one more run each time: no retry, no queue here.
//
// Outputs are scalars only, exactly the keys the manifest declares. An
// unknown counter is -1 (an output cannot be empty and 0 would be a lie);
// an unknown text is ''.
// -----------------------------------------------------------------------------

import { countersOf, readBuild } from './read.js';
import { buildLabel, pullRequestLabel } from './device.js';
import { t } from './i18n.js';

const SCENE_ACTIONS = { GET_PROJECT: 'get_project', RUN_PIPELINE: 'run_pipeline' };
const UNKNOWN = -1;
const MAX_TEXT = 10000;

const clip = (value) => String(value ?? '').slice(0, MAX_TEXT);
const number = (value) => (Number.isInteger(value) ? value : UNKNOWN);

/**
 * @description The outputs of `get_project`.
 * @param {object} project - The project snapshot.
 * @param {string} language - Language of the texts.
 * @returns {object} The outputs.
 * @example
 * buildProjectOutputs(snapshot, 'fr').summary;
 */
function buildProjectOutputs(project, language) {
  const counters = countersOf(project);
  const build = project.builds?.[0] ?? null;
  return {
    project_name: clip(project.name),
    url: clip(project.url),
    active_pull_requests: number(counters.activePullRequests),
    pull_requests_to_review: number(counters.toReview),
    my_work_items: number(counters.myWorkItems),
    failed_pipelines: number(counters.failedPipelines),
    running_builds: number(counters.runningBuilds),
    last_build: clip(buildLabel(build, language)),
    last_build_result: build?.result ?? '',
    last_build_url: clip(build?.url),
    latest_pull_request: clip(pullRequestLabel(project.pullRequests?.[0])),
    summary: clip(
      t('summaryProject', language, {
        project: project.name,
        reviews: number(counters.toReview),
        items: number(counters.myWorkItems),
        failed: number(counters.failedPipelines),
      }),
    ),
  };
}

/**
 * @description Find a pipeline by id, name or `folder\name` (case-insensitive).
 * @param {object[]} pipelines - The pipelines of the project.
 * @param {unknown} wanted - The id or name typed in the scene.
 * @returns {{ pipeline: object|null, ambiguous: boolean }} The pipeline.
 * @example
 * findPipeline(project.pipelines, 'CI'); // -> { pipeline: { id: 12, … }, ambiguous: false }
 */
function findPipeline(pipelines, wanted) {
  const value = String(wanted ?? '').trim();
  if (!value) {
    return { pipeline: null, ambiguous: false };
  }
  if (/^\d+$/.test(value)) {
    const byId = pipelines.find((pipeline) => pipeline.id === Number(value));
    if (byId) {
      return { pipeline: byId, ambiguous: false };
    }
  }
  const key = value.replace(/\//g, '\\').replace(/^\\+/, '').toLowerCase();
  const full = (pipeline) =>
    (pipeline.folder ? `${pipeline.folder}\\${pipeline.name}` : pipeline.name).toLowerCase();
  const exact = pipelines.filter((pipeline) => full(pipeline) === key);
  if (exact.length === 1) {
    return { pipeline: exact[0], ambiguous: false };
  }
  const named = pipelines.filter((pipeline) => pipeline.name.toLowerCase() === key);
  return { pipeline: named.length === 1 ? named[0] : null, ambiguous: named.length > 1 };
}

/**
 * @description The outputs of `run_pipeline`, from the queued run.
 * @param {object} project - The project snapshot.
 * @param {object} pipeline - The pipeline.
 * @param {object} raw - The raw queued build.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
function buildRunOutputs(project, pipeline, raw, language) {
  const build = readBuild(raw) ?? { id: UNKNOWN, number: '', branch: '', url: '' };
  return {
    project_name: clip(project.name),
    pipeline: clip(pipeline.name),
    build_id: number(build.id),
    build_number: clip(build.number),
    branch: clip(build.branch),
    url: clip(build.url),
    summary: clip(
      t('summaryRun', language, {
        project: project.name,
        pipeline: pipeline.name,
        number: build.number,
        branch: build.branch || '?',
      }),
    ),
  };
}

export { SCENE_ACTIONS, UNKNOWN, buildProjectOutputs, findPipeline, buildRunOutputs };
