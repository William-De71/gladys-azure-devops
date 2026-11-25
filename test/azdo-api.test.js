import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAzdoClient,
  readOrganization,
  assignedQuery,
  AzdoError,
  MAX_PROJECTS,
} from '../src/azdo-api.js';
import {
  azdoApi,
  projectData,
  response,
  AUTH,
  BASE_URL,
  NOW,
  OTHER_ID,
  PROJECT_ID,
  TEST_TOKEN,
  USER_ID,
} from './helpers/fixtures.js';

/**
 * @description A client on a fake organization.
 * @param {object} [options] - `{ projects, fail, token }`.
 * @returns {{ client: object, fetch: Function }} The client and its fetch.
 */
function setup({ projects = [projectData()], fail = [], token = TEST_TOKEN } = {}) {
  const fetch = azdoApi(() => ({ projects }), { fail });
  const client = createAzdoClient({
    getToken: () => token,
    getBaseUrl: () => BASE_URL,
    getUserAgent: () => 'gladys-azure-devops/test',
    fetch,
    now: () => NOW,
  });
  return { client, fetch };
}

test('readOrganization accepts a name, any Services link and a Server collection', () => {
  const services = { baseUrl: 'https://dev.azure.com/contoso', organization: 'contoso' };
  assert.deepEqual(readOrganization('contoso'), services);
  assert.deepEqual(readOrganization(' https://dev.azure.com/contoso/Web/_build?x=1 '), services);
  assert.deepEqual(readOrganization('dev.azure.com/contoso/'), services);
  assert.deepEqual(readOrganization('https://contoso.visualstudio.com/Web/_git/app'), services);
  assert.deepEqual(readOrganization('https://tfs.example.com/tfs/DefaultCollection/Web/_build'), {
    baseUrl: 'https://tfs.example.com/tfs/DefaultCollection',
    organization: 'DefaultCollection',
  });
  assert.deepEqual(readOrganization('http://ado.lan:8080/Main/_apis/projects'), {
    baseUrl: 'http://ado.lan:8080/Main',
    organization: 'Main',
  });
  for (const bad of [
    '',
    '   ',
    'https://dev.azure.com/',
    'ftp://x/y',
    'https://host.example',
    42,
  ]) {
    assert.equal(readOrganization(bad), null, String(bad));
  }
});

test('a round reads the user, the projects and seven parts per project, with the PAT in Basic', async () => {
  const { client, fetch } = setup();
  const answer = await client.round([]);
  assert.deepEqual(answer.user, { id: USER_ID, name: 'Ada Lovelace' });
  assert.equal(answer.projects.length, 1);
  assert.equal(answer.total, 1);
  assert.deepEqual(answer.missing, []);
  assert.deepEqual(answer.refused, []);
  const raw = answer.projects[0];
  assert.equal(raw.project.id, PROJECT_ID);
  assert.equal(raw.definitions.length, 2);
  assert.equal(raw.completedBuilds.length, 2);
  assert.equal(raw.runningBuilds.length, 1);
  assert.equal(raw.activePullRequests.length, 3);
  assert.equal(raw.completedPullRequests.length, 1);
  assert.deepEqual(
    raw.workItems.map((item) => item.id),
    [101, 102],
  );
  assert.equal(fetch.calls.length, 9);
  for (const call of fetch.calls) {
    assert.equal(call.headers.Authorization, AUTH);
    assert.equal(call.headers['X-TFS-FedAuthRedirect'], 'Suppress');
    assert.equal(call.query.get('api-version'), '7.1');
    assert.ok(call.url.startsWith(`${BASE_URL}/`));
  }
  const wiql = fetch.calls.find((call) => call.path.endsWith('/wit/wiql'));
  assert.equal(wiql.method, 'POST');
  assert.equal(wiql.headers['Content-Type'], 'application/json');
  assert.equal(wiql.body.query, assignedQuery());
  assert.match(assignedQuery(), /@Me/);
  assert.match(assignedQuery(), /NOT IN \('Closed', 'Done', 'Removed'/);
});

test('no work item assigned: the work items are an empty list, read with one request less', async () => {
  const { client, fetch } = setup({ projects: [projectData({ workItems: [] })] });
  const answer = await client.round([]);
  assert.deepEqual(answer.projects[0].workItems, []);
  assert.equal(fetch.calls.length, 8);
});

test('projects by name (case-insensitive) or GUID, in the configured order; missing ones named', async () => {
  const projects = [projectData(), projectData({ id: OTHER_ID, name: 'Mobile App' })];
  const { client } = setup({ projects });
  const answer = await client.round(['mobile app', 'Gone', PROJECT_ID.toUpperCase(), 'web']);
  assert.deepEqual(
    answer.projects.map((raw) => raw.project.name),
    ['Mobile App', 'Web'],
  );
  assert.deepEqual(answer.missing, ['Gone']);
  assert.equal(answer.total, 2);
});

test('all projects: sorted by name, capped', async () => {
  const projects = Array.from({ length: MAX_PROJECTS + 3 }, (_, i) =>
    projectData({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: `P${String(30 - i).padStart(2, '0')}`,
    }),
  );
  const { client } = setup({ projects });
  const answer = await client.round([]);
  assert.equal(answer.projects.length, MAX_PROJECTS);
  assert.equal(answer.projects[0].project.name, 'P08');
  assert.equal(answer.total, MAX_PROJECTS + 3);
});

test('a refused or absent part is null and its scope is named; the rest is read', async () => {
  const { client } = setup({
    fail: [
      [/wit\/wiql/, 401],
      [/git\/pullrequests/, 403],
      [/build\/definitions/, 404],
    ],
  });
  const answer = await client.round([]);
  const raw = answer.projects[0];
  assert.equal(raw.workItems, null);
  assert.equal(raw.activePullRequests, null);
  assert.equal(raw.completedPullRequests, null);
  assert.equal(raw.definitions, null, 'a service turned off');
  assert.equal(raw.completedBuilds.length, 2);
  assert.deepEqual(answer.refused, ['code', 'work']);
});

test('a refused token, a sign-in redirect or the anonymous user: auth', async () => {
  await assert.rejects(setup({ token: 'wrong' }).client.round([]), { kind: 'auth' });
  await assert.rejects(setup({ token: '' }).client.round([]), { kind: 'auth' });
  await assert.rejects(
    setup({ fail: [[/connectionData/, 302, { location: 'https://login' }]] }).client.round([]),
    { kind: 'auth' },
  );
  const anonymous = createAzdoClient({
    getToken: () => TEST_TOKEN,
    getBaseUrl: () => BASE_URL,
    getUserAgent: () => 'test',
    fetch: async () =>
      response(200, { authenticatedUser: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } }),
  });
  await assert.rejects(anonymous.round([]), { kind: 'auth' });
});

test('errors carry a kind: unknown organization, projects not listable, 5xx, network, not JSON', async () => {
  const unknown = createAzdoClient({
    getToken: () => TEST_TOKEN,
    getBaseUrl: () => 'https://dev.azure.com/nobody',
    getUserAgent: () => 'test',
    fetch: azdoApi(() => ({ projects: [] })),
  });
  await assert.rejects(unknown.round([]), { kind: 'not_found' });
  await assert.rejects(setup({ fail: [[/\/_apis\/projects$/, 401]] }).client.round([]), {
    kind: 'scope',
  });
  await assert.rejects(setup({ fail: [[/build\/builds/, 503]] }).client.round([]), {
    kind: 'server',
  });
  const offline = createAzdoClient({
    getToken: () => TEST_TOKEN,
    getBaseUrl: () => BASE_URL,
    getUserAgent: () => 'test',
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(
    offline.round([]),
    (err) => err instanceof AzdoError && err.kind === 'network',
  );
  const html = createAzdoClient({
    getToken: () => TEST_TOKEN,
    getBaseUrl: () => BASE_URL,
    getUserAgent: () => 'test',
    fetch: async (url) =>
      url.includes('connectionData') ? response(200, undefined) : response(200, { value: [] }),
  });
  assert.deepEqual((await html.round([])).user, { id: null, name: '' }, 'connectionData missing');
});

test('429 and Retry-After push the next round back', async () => {
  const { client } = setup({ fail: [[/connectionData/, 429, { 'Retry-After': '120' }]] });
  await assert.rejects(
    client.round([]),
    (err) => err.kind === 'rate_limit' && err.resetAt === NOW + 120000,
  );
  const delayed = setup({ fail: [] });
  const fetch = async (url, init) => {
    const answer = await delayed.fetch(url, init);
    return { ...answer, headers: { get: (name) => (name === 'retry-after' ? '30' : null) } };
  };
  const client2 = createAzdoClient({
    getToken: () => TEST_TOKEN,
    getBaseUrl: () => BASE_URL,
    getUserAgent: () => 'test',
    fetch,
    now: () => NOW,
  });
  assert.equal(client2.throttledUntil(), null);
  await client2.round([]);
  assert.equal(client2.throttledUntil(), NOW + 30000);
});

test('queueBuild posts the definition and the branch as a ref', async () => {
  const { client, fetch } = setup();
  const build = await client.queueBuild(PROJECT_ID, 12, 'release/1.2');
  assert.equal(build.id, 999);
  const call = fetch.calls.at(-1);
  assert.equal(call.method, 'POST');
  assert.equal(call.path, `/${PROJECT_ID}/_apis/build/builds`);
  assert.deepEqual(call.body, { definition: { id: 12 }, sourceBranch: 'refs/heads/release/1.2' });
  await client.queueBuild(PROJECT_ID, 12, '');
  assert.deepEqual(fetch.calls.at(-1).body, { definition: { id: 12 } });
  await client.queueBuild(PROJECT_ID, 12, 'refs/tags/v1');
  assert.equal(fetch.calls.at(-1).body.sourceBranch, 'refs/tags/v1');
});
