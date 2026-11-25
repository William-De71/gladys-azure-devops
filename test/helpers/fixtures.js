// Shapes of the Azure DevOps REST 7.1 answers (as the reference documents
// them and as a public organization answers them), a fake Azure DevOps behind
// `fetch`, and a stand-in for the SDK external ids. Tests never touch the
// network.

export const NOW = Date.parse('2026-11-25T10:00:00Z');
export const BASE_URL = 'https://dev.azure.com/contoso';
export const USER_ID = '6f1d2c3b-4a5e-4f60-9a1b-2c3d4e5f6a7b';
export const BOB_ID = '0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
export const PROJECT_ID = 'cbb18261-c48f-4abb-8651-8cdcb5474649';
export const OTHER_ID = '3b4f6a2e-1d7c-4e8a-b5f9-0c2d4e6a8b1c';
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const iso = (ms) => new Date(ms).toISOString();

/**
 * @description A build, as Azure DevOps answers it.
 * @param {object} [options] - Overrides.
 * @returns {object} The raw build.
 */
export function rawBuild({
  id = 901,
  number = '20261125.4',
  pipelineId = 12,
  pipeline = 'CI',
  status = 'completed',
  result = 'failed',
  branch = 'refs/heads/main',
  finish = NOW - 30 * MINUTE,
  queue = NOW - 40 * MINUTE,
  by = 'Bob Martin',
  reason = 'individualCI',
} = {}) {
  return {
    _links: {
      web: { href: `${BASE_URL}/${PROJECT_ID}/_build/results?buildId=${id}` },
    },
    id,
    buildNumber: number,
    status,
    result: status === 'completed' ? result : undefined,
    queueTime: iso(queue),
    startTime: iso(queue + MINUTE),
    finishTime: status === 'completed' ? iso(finish) : undefined,
    definition: { id: pipelineId, name: pipeline, path: '\\' },
    project: { id: PROJECT_ID, name: 'Web' },
    sourceBranch: branch,
    sourceVersion: 'a'.repeat(40),
    reason,
    requestedFor: { id: BOB_ID, displayName: by },
  };
}

/**
 * @description A pipeline (build definition) with its last runs.
 * @param {object} [options] - Overrides.
 * @returns {object} The raw definition.
 */
export function rawDefinition({
  id = 12,
  name = 'CI',
  path = '\\',
  latest = rawBuild(),
  lastCompleted = latest,
  queueStatus = 'enabled',
} = {}) {
  return {
    _links: { web: { href: `${BASE_URL}/${PROJECT_ID}/_build/definition?definitionId=${id}` } },
    id,
    name,
    path,
    queueStatus,
    type: 'build',
    latestBuild: latest ?? undefined,
    latestCompletedBuild: lastCompleted ?? undefined,
  };
}

/**
 * @description A pull request.
 * @param {object} [options] - Overrides.
 * @returns {object} The raw pull request.
 */
export function rawPullRequest({
  id = 41,
  title = 'Add the login page',
  author = 'Bob Martin',
  authorId = BOB_ID,
  draft = false,
  repository = 'web-app',
  target = 'refs/heads/main',
  source = 'refs/heads/feature/login',
  created = NOW - 2 * HOUR,
  closed = null,
  status = 'active',
  reviewers = [{ id: USER_ID, displayName: 'Ada Lovelace', vote: 0 }],
} = {}) {
  return {
    repository: { id: 'r1', name: repository, project: { id: PROJECT_ID, name: 'Web' } },
    pullRequestId: id,
    status,
    createdBy: { id: authorId, displayName: author },
    creationDate: iso(created),
    closedDate: closed === null ? undefined : iso(closed),
    title,
    sourceRefName: source,
    targetRefName: target,
    mergeStatus: 'succeeded',
    isDraft: draft,
    reviewers: reviewers.map((reviewer) => ({ isFlagged: false, hasDeclined: false, ...reviewer })),
    url: `${BASE_URL}/${PROJECT_ID}/_apis/git/repositories/r1/pullRequests/${id}`,
  };
}

/**
 * @description A work item, with the fields the integration asks for.
 * @param {object} [options] - Overrides.
 * @returns {object} The raw work item.
 */
export function rawWorkItem({
  id = 101,
  title = 'Login fails on Safari',
  type = 'Bug',
  state = 'Active',
  changed = NOW - 3 * HOUR,
} = {}) {
  return {
    id,
    rev: 3,
    fields: {
      'System.Id': id,
      'System.Title': title,
      'System.WorkItemType': type,
      'System.State': state,
      'System.ChangedDate': iso(changed),
      'System.CreatedDate': iso(changed - 24 * HOUR),
    },
    url: `${BASE_URL}/_apis/wit/workItems/${id}`,
  };
}

/**
 * @description The data of a project in the fake organization.
 * @param {object} [options] - Overrides.
 * @returns {object} The project data.
 */
export function projectData({
  id = PROJECT_ID,
  name = 'Web',
  definitions = [
    rawDefinition(),
    rawDefinition({
      id: 13,
      name: 'Deploy',
      latest: rawBuild({ id: 905, pipelineId: 13, pipeline: 'Deploy', status: 'inProgress' }),
      lastCompleted: rawBuild({
        id: 900,
        pipelineId: 13,
        pipeline: 'Deploy',
        result: 'succeeded',
        finish: NOW - 2 * HOUR,
      }),
    }),
  ],
  completed = [
    rawBuild(),
    rawBuild({
      id: 900,
      pipelineId: 13,
      pipeline: 'Deploy',
      result: 'succeeded',
      finish: NOW - 2 * HOUR,
    }),
  ],
  running = [rawBuild({ id: 905, pipelineId: 13, pipeline: 'Deploy', status: 'inProgress' })],
  active = [
    rawPullRequest(),
    rawPullRequest({
      id: 40,
      title: 'Bump the SDK',
      author: 'Ada Lovelace',
      authorId: USER_ID,
      created: NOW - 5 * HOUR,
      reviewers: [{ id: BOB_ID, displayName: 'Bob Martin', vote: 10 }],
    }),
    rawPullRequest({ id: 39, title: 'WIP: dark mode', draft: true, created: NOW - 9 * HOUR }),
  ],
  merged = [
    rawPullRequest({
      id: 38,
      title: 'Fix the footer',
      status: 'completed',
      closed: NOW - 6 * HOUR,
      created: NOW - 8 * HOUR,
    }),
  ],
  workItems = [
    rawWorkItem(),
    rawWorkItem({
      id: 102,
      title: 'Remember the last tab',
      type: 'User Story',
      state: 'New',
      changed: NOW - 26 * HOUR,
    }),
  ],
} = {}) {
  return { id, name, definitions, completed, running, active, merged, workItems };
}

/**
 * @description The raw parts of a project as azdo-api.js `round` gathers them.
 * @param {object} [data] - projectData() overrides.
 * @returns {object} The raw project.
 */
export function rawProject(data = {}) {
  const project = projectData(data);
  return {
    project: { id: project.id, name: project.name, description: 'The web shop' },
    definitions: project.definitions,
    completedBuilds: project.completed,
    runningBuilds: project.running,
    activePullRequests: project.active,
    completedPullRequests: project.merged,
    workItems: project.workItems,
  };
}

/**
 * @description A fetch Response stand-in.
 * @param {number} status - The HTTP status.
 * @param {unknown} body - The JSON body (undefined: not JSON).
 * @param {object} [headers] - The headers.
 * @returns {object} The response.
 */
export function response(status, body, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        lower[name.toLowerCase()] === undefined ? null : String(lower[name.toLowerCase()]),
    },
    json: async () => {
      if (body === undefined) {
        throw new SyntaxError('no JSON');
      }
      return JSON.parse(JSON.stringify(body));
    },
  };
}

const TOKEN = 'azdo-test-token';
export const AUTH = `Basic ${Buffer.from(`:${TOKEN}`).toString('base64')}`;

/**
 * @description A fake Azure DevOps organization: the routes of azdo-api.js.
 * @param {Function} getState - `() => ({ projects: projectData[], user })`.
 * @param {object} [options] - `{ fail }`: [path regex, status, headers?] answered instead.
 * @returns {Function} The fetch, with `calls`.
 */
export function azdoApi(getState, { fail = [] } = {}) {
  const api = async (url, init = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/contoso/, '');
    const call = {
      url,
      path,
      method: init.method ?? 'GET',
      query: parsed.searchParams,
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    api.calls.push(call);
    for (const [pattern, status, headers = {}] of fail) {
      if (pattern.test(`${call.method} ${path}`)) {
        return response(status, status === 302 ? undefined : { message: `${status}` }, headers);
      }
    }
    if (!parsed.pathname.startsWith('/contoso/')) {
      return response(404, undefined);
    }
    if (init.headers?.Authorization !== AUTH) {
      return response(401, { message: 'TF400813: not authorized' });
    }
    const state = getState();
    if (path === '/_apis/connectionData') {
      return response(200, {
        authenticatedUser: { id: state.user?.id ?? USER_ID, providerDisplayName: 'Ada Lovelace' },
      });
    }
    if (path === '/_apis/projects') {
      return response(200, {
        count: state.projects.length,
        value: state.projects.map((p) => ({ id: p.id, name: p.name, state: 'wellFormed' })),
      });
    }
    const match = /^\/([0-9a-f-]{36})\/_apis\/(.+)$/.exec(path);
    const project = match && state.projects.find((p) => p.id === match[1]);
    if (!project) {
      return response(404, { message: 'TF200016: project not found' });
    }
    const route = match[2];
    const q = (name) => parsed.searchParams.get(name);
    if (route === 'build/definitions') {
      return response(200, { count: project.definitions.length, value: project.definitions });
    }
    if (route === 'build/builds' && call.method === 'POST') {
      const definition = project.definitions.find((d) => d.id === call.body.definition.id);
      return response(
        200,
        rawBuild({
          id: 999,
          number: '20261125.9',
          pipelineId: definition.id,
          pipeline: definition.name,
          status: 'notStarted',
          branch: call.body.sourceBranch ?? 'refs/heads/main',
        }),
      );
    }
    if (route === 'build/builds') {
      const value = q('statusFilter') === 'completed' ? project.completed : project.running;
      return response(200, { count: value.length, value }, { 'x-ms-continuationtoken': 'x' });
    }
    if (route === 'git/pullrequests') {
      const value = q('searchCriteria.status') === 'active' ? project.active : project.merged;
      return response(200, { value, count: value.length });
    }
    if (route === 'wit/wiql') {
      return response(200, {
        queryType: 'flat',
        workItems: project.workItems.map((item) => ({ id: item.id, url: item.url })),
      });
    }
    if (route === 'wit/workitems') {
      const ids = q('ids').split(',').map(Number);
      const value = ids.map((id) => project.workItems.find((item) => item.id === id) ?? null);
      return response(200, { count: value.length, value });
    }
    return response(404, { message: 'not found' });
  };
  api.calls = [];
  return api;
}

export const TEST_TOKEN = TOKEN;

export const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:azure-devops:${type}:${id}`,
    feature: (key) => `ext:azure-devops:${type}:${id}:${key}`,
  }),
};

export const silent = { debug() {}, info() {}, warn() {}, error() {} };
