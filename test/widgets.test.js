import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildOverviewWidget,
  buildPipelinesWidget,
  buildPullRequestsWidget,
  buildWorkItemsWidget,
  messageContent,
  readCount,
  PULL_REQUEST_FILTERS,
} from '../src/widgets.js';
import { readProject } from '../src/read.js';
import { LANGUAGES } from '../src/i18n.js';
import { rawProject, projectData, BASE_URL, NOW, OTHER_ID, USER_ID } from './helpers/fixtures.js';

const context = { baseUrl: BASE_URL, userId: USER_ID };
const web = readProject(rawProject(), context);
const mobile = readProject(rawProject({ id: OTHER_ID, name: 'Mobile App' }), context);
const blind = readProject(
  {
    ...rawProject(),
    definitions: null,
    activePullRequests: null,
    workItems: null,
    completedBuilds: null,
    runningBuilds: null,
  },
  context,
);

/**
 * @description Validate a content like the core does, and return it.
 * @param {object} content - The content.
 * @returns {object} The content.
 */
function valid(content) {
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.length <= 8);
  return content;
}

const types = (content) => content.components.map((component) => component.type);

test('every widget, in every language and setting, passes the core validation', () => {
  for (const language of LANGUAGES) {
    const common = { language, now: NOW, pollSeconds: 120 };
    valid(
      buildOverviewWidget({
        ...common,
        projects: [web, mobile],
        title: 'contoso',
        url: BASE_URL,
        now: NOW,
      }),
    );
    valid(
      buildOverviewWidget({ ...common, projects: [blind], title: 'Web', url: web.url, now: NOW }),
    );
    valid(buildPipelinesWidget({ ...common, project: web }));
    valid(buildPipelinesWidget({ ...common, project: blind }));
    for (const filter of PULL_REQUEST_FILTERS) {
      valid(buildPullRequestsWidget({ ...common, projects: [web, mobile], settings: { filter } }));
      valid(
        buildPullRequestsWidget({ ...common, projects: [web], settings: { filter, count: 1 } }),
      );
    }
    valid(buildPullRequestsWidget({ ...common, projects: [blind] }));
    valid(buildWorkItemsWidget({ ...common, projects: [web, mobile] }));
    valid(buildWorkItemsWidget({ ...common, projects: [blind] }));
    valid(messageContent('x'.repeat(500)));
  }
});

test('overview: four tiles summed over the projects, the last run, a link', () => {
  const content = buildOverviewWidget({
    projects: [web, mobile],
    title: 'contoso',
    url: BASE_URL,
    language: 'en',
    now: NOW,
    pollSeconds: 120,
  });
  assert.deepEqual(types(content), [
    'text',
    'value',
    'value',
    'value',
    'value',
    'status',
    'button',
  ]);
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((c) => c.value),
    [2, 4, 2, 2],
  );
  assert.equal(content.components[3].color, 'danger');
  assert.deepEqual(content.components[5].items[0], {
    label: 'Last run: CI',
    value: 'Failed · 30 min ago',
    color: 'danger',
  });
  assert.equal(content.components[6].link.url, BASE_URL);
  const unknown = buildOverviewWidget({
    projects: [blind],
    title: 'Web',
    url: '',
    language: 'fr',
    now: NOW,
    pollSeconds: 120,
  });
  assert.deepEqual(types(unknown), ['text', 'value', 'value', 'value', 'value']);
  assert.equal(unknown.components[1].value, '–');
});

test('pipelines: a running run shown as running, newest first, with links', () => {
  const content = buildPipelinesWidget({
    project: web,
    language: 'fr',
    now: NOW,
    pollSeconds: 120,
  });
  const items = content.components[1].items;
  assert.deepEqual(
    items.map((item) => [item.title, item.badge.text, item.badge.color]),
    [
      ['CI', 'Échec', 'danger'],
      ['Deploy', 'En cours', 'info'],
    ],
  );
  assert.equal(items[0].subtitle, '#20261125.4 · main · il y a 30 min');
  assert.equal(items[0].description, '#20261125.4 · main · Bob Martin · il y a 30 min');
  assert.equal(items[0].date, undefined, 'a date would hide the description');
  assert.match(items[0].links[0].url, /buildId=901$/);
  const none = buildPipelinesWidget({
    project: readProject(rawProject({ definitions: [] }), context),
    language: 'en',
    pollSeconds: 120,
  });
  assert.equal(none.components[1].text, 'No pipeline has run in this project yet.');
});

test('pull requests: filters, badges, project names when several are listed', () => {
  const all = buildPullRequestsWidget({
    projects: [web],
    language: 'en',
    now: NOW,
    pollSeconds: 120,
  });
  assert.deepEqual(
    all.components[1].items.map((item) => [item.title, item.badge.text]),
    [
      ['!41 Add the login page', 'To review'],
      ['!40 Bump the SDK', 'Approved (1)'],
      ['!39 WIP: dark mode', 'Draft'],
    ],
  );
  assert.equal(
    all.components[1].items[0].description,
    'web-app: feature/login → main, by Bob Martin · 2 h ago',
  );
  assert.equal(all.components[1].items[0].subtitle, 'web-app · Bob Martin · 2 h ago');
  const toReview = buildPullRequestsWidget({
    projects: [web, mobile],
    language: 'en',
    settings: { filter: 'to_review' },
    pollSeconds: 120,
  });
  assert.equal(toReview.components[0].text, 'All projects (2)');
  assert.equal(toReview.components[1].items.length, 2);
  assert.match(toReview.components[1].items[0].description, /^(Web|Mobile App) \/ web-app/);
  const mine = buildPullRequestsWidget({
    projects: [readProject(rawProject({ active: [] }), context)],
    language: 'es',
    settings: { filter: 'mine' },
    pollSeconds: 120,
  });
  assert.equal(mine.components[1].text, 'Ninguna de sus pull requests está activa.');
});

test('work items: last changed first, type as badge, count bounded', () => {
  const content = buildWorkItemsWidget({
    projects: [web],
    language: 'de',
    settings: { count: 1 },
    now: NOW,
    pollSeconds: 120,
  });
  assert.deepEqual(content.components[1].items, [
    {
      title: '#101 Login fails on Safari',
      subtitle: 'Active · vor 3 Std.',
      description: 'Bug: Login fails on Safari · Active · vor 3 Std.',
      badge: { text: 'Bug', color: 'info' },
      links: [{ url: `${BASE_URL}/Web/_workitems/edit/101`, label: 'Azure DevOps' }],
    },
  ]);
  const empty = buildWorkItemsWidget({
    projects: [readProject(rawProject(projectData({ workItems: [] })), context)],
    language: 'en',
    pollSeconds: 120,
  });
  assert.equal(empty.components[1].text, 'No open work item is assigned to you.');
  assert.equal(readCount('99'), 8);
  assert.equal(readCount(''), 6);
});
