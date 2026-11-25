import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readProject, countersOf, shortRef, readBuild } from '../src/read.js';
import {
  rawProject,
  rawPullRequest,
  rawBuild,
  BASE_URL,
  NOW,
  PROJECT_ID,
  USER_ID,
} from './helpers/fixtures.js';

const context = { baseUrl: BASE_URL, userId: USER_ID };

test('a project snapshot: runs, pipelines, pull requests, work items and their links', () => {
  const project = readProject(rawProject(), context);
  assert.equal(project.id, PROJECT_ID);
  assert.equal(project.name, 'Web');
  assert.equal(project.url, `${BASE_URL}/Web`);
  assert.deepEqual(
    project.builds.map((build) => [build.id, build.result]),
    [
      [901, 'failed'],
      [900, 'succeeded'],
    ],
  );
  const [ci, deploy] = project.pipelines;
  assert.equal(ci.lastCompleted.result, 'failed');
  assert.equal(deploy.latest.status, 'inProgress');
  assert.equal(deploy.latest.result, null);
  assert.equal(project.running, 1);
  const [review, mine, draft] = project.pullRequests;
  assert.equal(review.toReview, true);
  assert.equal(review.url, `${BASE_URL}/Web/_git/web-app/pullrequest/41`);
  assert.equal(review.source, 'feature/login');
  assert.equal(mine.mine, true);
  assert.equal(mine.toReview, false);
  assert.equal(mine.approvals, 1);
  assert.equal(draft.draft, true);
  assert.equal(project.completedPullRequests[0].closedAt, NOW - 6 * 3600000);
  assert.deepEqual(project.workItems[0], {
    id: 101,
    title: 'Login fails on Safari',
    type: 'Bug',
    state: 'Active',
    changedAt: NOW - 3 * 3600000,
    createdAt: NOW - 27 * 3600000,
    url: `${BASE_URL}/Web/_workitems/edit/101`,
  });
});

test('counters: unknown parts are null, never 0', () => {
  assert.deepEqual(countersOf(readProject(rawProject(), context)), {
    activePullRequests: 3,
    toReview: 1,
    myWorkItems: 2,
    failedPipelines: 1,
    runningBuilds: 1,
  });
  const blind = readProject(
    {
      ...rawProject(),
      definitions: null,
      runningBuilds: null,
      activePullRequests: null,
      workItems: null,
    },
    context,
  );
  assert.deepEqual(countersOf(blind), {
    activePullRequests: null,
    toReview: null,
    myWorkItems: null,
    failedPipelines: null,
    runningBuilds: null,
  });
  const anonymous = readProject(rawProject(), { baseUrl: BASE_URL, userId: null });
  assert.equal(countersOf(anonymous).toReview, null, 'unknown user: unknown count');
});

test('to review: not voted yet, not mine, not a draft; a disabled pipeline never counts as failed', () => {
  const raw = rawProject({
    active: [
      rawPullRequest({ id: 1, reviewers: [{ id: USER_ID, vote: 10 }] }),
      rawPullRequest({ id: 2, authorId: USER_ID }),
      rawPullRequest({ id: 3, draft: true }),
      rawPullRequest({
        id: 4,
        reviewers: [
          { id: USER_ID, vote: -10 },
          { id: 'x', vote: -5 },
        ],
      }),
    ],
  });
  raw.definitions[0].queueStatus = 'disabled';
  const project = readProject(raw, context);
  assert.deepEqual(
    project.pullRequests.map((pull) => pull.toReview),
    [false, false, false, false],
  );
  assert.equal(project.pullRequests[0].rejected, true);
  assert.equal(project.pullRequests[0].waiting, true);
  assert.equal(countersOf(project).failedPipelines, 0);
});

test('refs, odd answers and unusable projects', () => {
  assert.equal(shortRef('refs/heads/feature/login'), 'feature/login');
  assert.equal(shortRef('refs/pull/20995/merge'), 'PR 20995');
  assert.equal(shortRef('refs/tags/v1.2'), 'v1.2');
  assert.equal(shortRef(undefined), '');
  assert.equal(readBuild({ id: 'x' }), null);
  assert.equal(readBuild(rawBuild({ result: 'weird' })).result, null);
  assert.equal(readProject(null, context), null);
  assert.equal(readProject({ project: { id: 7 } }, context), null);
  const sparse = readProject({ project: { id: PROJECT_ID.toUpperCase(), name: 'Web' } }, {});
  assert.equal(sparse.id, PROJECT_ID);
  assert.equal(sparse.pipelines, null);
  assert.equal(sparse.url, '');
});
