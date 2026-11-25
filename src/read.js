// -----------------------------------------------------------------------------
// Reading the Azure DevOps answers into plain snapshots.
//
// Everything the devices, the widgets, the scene triggers and the scene
// actions need comes from these snapshots: they never touch the raw answer.
// A missing or malformed field becomes null (or an empty list), never an
// exception. A part the token could not read stays null: its counters are
// not published, never set to 0.
// -----------------------------------------------------------------------------

import { pullRequestLink, workItemLink } from './azdo-api.js';

const integer = (value) => (Number.isInteger(value) ? value : null);
const text = (value) => (typeof value === 'string' ? value : '');
const time = (value) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

// Vote of a reviewer: https://learn.microsoft.com/rest/api/azure/devops/git/pull-requests
const VOTES = { APPROVED: 10, SUGGESTIONS: 5, NONE: 0, WAITING: -5, REJECTED: -10 };
const RESULTS = ['succeeded', 'partiallySucceeded', 'failed', 'canceled'];

/**
 * @description The short name of a git ref: `refs/heads/main` -> `main`,
 * `refs/pull/12/merge` -> `PR 12`, `refs/tags/v1` -> `v1`.
 * @param {unknown} ref - The ref.
 * @returns {string} The name.
 * @example
 * shortRef('refs/heads/feature/login'); // -> 'feature/login'
 */
function shortRef(ref) {
  const value = text(ref);
  const pull = /^refs\/pull\/(\d+)\//.exec(value);
  if (pull) {
    return `PR ${pull[1]}`;
  }
  return value.replace(/^refs\/(heads|tags)\//, '');
}

/**
 * @description A build (a run of a pipeline).
 * @param {object} raw - The build.
 * @returns {object|null} The build, null without an id.
 */
function readBuild(raw) {
  if (!raw || !Number.isInteger(raw.id)) {
    return null;
  }
  return {
    id: raw.id,
    number: text(raw.buildNumber) || String(raw.id),
    pipelineId: integer(raw.definition?.id),
    pipeline: text(raw.definition?.name),
    status: text(raw.status),
    result: RESULTS.includes(raw.result) ? raw.result : null,
    branch: shortRef(raw.sourceBranch),
    requestedBy: text(raw.requestedFor?.displayName),
    reason: text(raw.reason),
    queuedAt: time(raw.queueTime),
    finishedAt: time(raw.finishTime),
    url: text(raw._links?.web?.href),
  };
}

/**
 * @description A pipeline (build definition) and its last runs.
 * @param {object} raw - The definition.
 * @returns {object|null} The pipeline.
 */
function readPipeline(raw) {
  if (!raw || !Number.isInteger(raw.id)) {
    return null;
  }
  return {
    id: raw.id,
    name: text(raw.name),
    folder: text(raw.path).replace(/^\\+/, ''),
    disabled: raw.queueStatus === 'disabled',
    latest: readBuild(raw.latestBuild),
    lastCompleted: readBuild(raw.latestCompletedBuild),
    url: text(raw._links?.web?.href),
  };
}

/**
 * @description A pull request.
 * @param {object} raw - The pull request.
 * @param {object} context - `{ baseUrl, project, userId }`.
 * @returns {object|null} The pull request.
 */
function readPullRequest(raw, { baseUrl, project, userId }) {
  if (!raw || !Number.isInteger(raw.pullRequestId)) {
    return null;
  }
  const repository = text(raw.repository?.name);
  const reviewers = (Array.isArray(raw.reviewers) ? raw.reviewers : [])
    .filter((reviewer) => reviewer && typeof reviewer.id === 'string')
    .map((reviewer) => ({
      id: reviewer.id,
      name: text(reviewer.displayName),
      vote: integer(reviewer.vote) ?? VOTES.NONE,
      required: reviewer.isRequired === true,
    }));
  const authorId = text(raw.createdBy?.id);
  const draft = raw.isDraft === true;
  const mine = reviewers.find((reviewer) => reviewer.id === userId);
  return {
    id: raw.pullRequestId,
    title: text(raw.title),
    author: text(raw.createdBy?.displayName),
    authorId,
    draft,
    repository,
    target: shortRef(raw.targetRefName),
    source: shortRef(raw.sourceRefName),
    createdAt: time(raw.creationDate),
    closedAt: time(raw.closedDate),
    url:
      repository && baseUrl ? pullRequestLink(baseUrl, project, repository, raw.pullRequestId) : '',
    approvals: reviewers.filter((reviewer) => reviewer.vote >= VOTES.SUGGESTIONS).length,
    rejected: reviewers.some((reviewer) => reviewer.vote === VOTES.REJECTED),
    waiting: reviewers.some((reviewer) => reviewer.vote === VOTES.WAITING),
    // Waiting for the token's user: a reviewer who has not voted yet, on a
    // pull request someone else opened, out of draft.
    toReview: Boolean(userId && mine && mine.vote === VOTES.NONE && authorId !== userId && !draft),
    mine: Boolean(userId && authorId === userId),
  };
}

/**
 * @description A work item.
 * @param {object} raw - The work item (with `fields`).
 * @param {object} context - `{ baseUrl, project }`.
 * @returns {object|null} The work item.
 */
function readWorkItem(raw, { baseUrl, project }) {
  if (!raw || !Number.isInteger(raw.id)) {
    return null;
  }
  const fields = raw.fields ?? {};
  return {
    id: raw.id,
    title: text(fields['System.Title']),
    type: text(fields['System.WorkItemType']),
    state: text(fields['System.State']),
    changedAt: time(fields['System.ChangedDate']),
    createdAt: time(fields['System.CreatedDate']),
    url: baseUrl ? workItemLink(baseUrl, project, raw.id) : '',
  };
}

const listOf = (raw, reader) => (Array.isArray(raw) ? raw.map(reader).filter(Boolean) : null);

/**
 * @description A project and everything read about it.
 * @param {object|null} raw - The raw parts of azdo-api.js `round`.
 * @param {object} context - `{ baseUrl, userId }`.
 * @returns {object|null} The snapshot, null when the raw project is unusable.
 * @example
 * readProject(answer.projects[0], { baseUrl: 'https://dev.azure.com/contoso', userId });
 */
function readProject(raw, { baseUrl, userId = null } = {}) {
  const project = raw?.project;
  if (!project || typeof project.id !== 'string' || typeof project.name !== 'string') {
    return null;
  }
  const context = { baseUrl, project: project.name, userId };
  const pipelines = listOf(raw.definitions, readPipeline);
  const builds = listOf(raw.completedBuilds, readBuild);
  const pullRequests = listOf(raw.activePullRequests, (item) => readPullRequest(item, context));
  const completedPullRequests = listOf(raw.completedPullRequests, (item) =>
    readPullRequest(item, context),
  );
  const workItems = listOf(raw.workItems, (item) => readWorkItem(item, context));
  builds?.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  pullRequests?.sort((a, b) => b.id - a.id);
  completedPullRequests?.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  return {
    id: project.id.toLowerCase(),
    name: project.name,
    description: text(project.description),
    url: baseUrl ? `${baseUrl}/${encodeURIComponent(project.name)}` : '',
    pipelines,
    builds,
    running: Array.isArray(raw.runningBuilds) ? raw.runningBuilds.length : null,
    pullRequests,
    completedPullRequests,
    workItems,
    userKnown: Boolean(userId),
  };
}

/**
 * @description The counters of a project, null when unknown.
 * @param {object} project - The snapshot.
 * @returns {{ activePullRequests: number|null, toReview: number|null,
 * myWorkItems: number|null, failedPipelines: number|null, runningBuilds: number|null }}
 * The counters.
 */
function countersOf(project) {
  const pulls = project.pullRequests;
  return {
    activePullRequests: pulls ? pulls.length : null,
    toReview: pulls && project.userKnown ? pulls.filter((pull) => pull.toReview).length : null,
    myWorkItems: project.workItems ? project.workItems.length : null,
    failedPipelines: project.pipelines
      ? project.pipelines.filter(
          (pipeline) => !pipeline.disabled && pipeline.lastCompleted?.result === 'failed',
        ).length
      : null,
    runningBuilds: project.running,
  };
}

export {
  VOTES,
  RESULTS,
  shortRef,
  readBuild,
  readPipeline,
  readPullRequest,
  readWorkItem,
  readProject,
  countersOf,
};
