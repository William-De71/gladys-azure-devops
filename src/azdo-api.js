// -----------------------------------------------------------------------------
// Azure DevOps REST API client (api-version 7.1): Azure DevOps Services
// (https://dev.azure.com/<organization>) or Azure DevOps Server 2022.1 and
// later (https://<server>/<collection>).
//
// Authentication: a personal access token (PAT) in a Basic header with an
// empty user name (https://learn.microsoft.com/azure/devops/organizations/
// accounts/use-personal-access-tokens-to-authenticate). The header
// `X-TFS-FedAuthRedirect: Suppress` makes a refused token answer 401 in JSON
// instead of a 302 to the sign-in page; a redirect left anyway (`redirect:
// 'manual'`) or a 203 sign-in page is a refused token too.
//
// A round reads (https://learn.microsoft.com/rest/api/azure/devops/):
//   GET  /_apis/connectionData                          who the token belongs to
//   GET  /_apis/projects?$top=200                       the projects
// and, for each followed project (PROJECT_CONCURRENCY at a time):
//   GET  /<p>/_apis/build/definitions?includeLatestBuilds=true   pipelines and their last runs
//   GET  /<p>/_apis/build/builds?statusFilter=completed&queryOrder=finishTimeDescending
//   GET  /<p>/_apis/build/builds?statusFilter=inProgress   running builds
//   GET  /<p>/_apis/git/pullrequests?searchCriteria.status=active
//   GET  /<p>/_apis/git/pullrequests?searchCriteria.status=completed
//   POST /<p>/_apis/wit/wiql                            work items assigned to the token's user
//   GET  /<p>/_apis/wit/workitems?ids=…                 their titles, types and states
// `<p>` is the project GUID. These requests weigh a few hundredths of a
// TSTU each: 20 projects every two minutes stay far below the 200 TSTUs per
// five minutes of the global limit.
//
// connectionData is not in the REST reference (the Azure CLI uses it): when
// an instance does not answer it, the user stays unknown and only the
// "to review" count needs them.
//
// A part the token may not read (a scope missing: Build, Code or Work items)
// or a service turned off in the project answers 401, 403 or 404 once the
// token itself is known valid: that part is null, its features not
// published, and its scope is reported.
//
// Throttling: a delayed request still answers 200 with `Retry-After`; a
// blocked one answers 429 (TF400733). Both push the next round back.
//
// Errors are AzdoError with a `kind`:
//   - `auth`        the token is missing, wrong, expired or revoked;
//   - `scope`       the token cannot list the projects (Project and team);
//   - `not_found`   no such organization or collection (404 on connectionData);
//   - `rate_limit`  429;
//   - `forbidden`   403;
//   - `server`      5xx;
//   - `network`     no answer (DNS, timeout, connection reset, bad URL);
//   - `invalid`     an answer that is not the expected JSON.
// -----------------------------------------------------------------------------

const API_VERSION = '7.1';
const SERVICES_HOST = 'https://dev.azure.com';
const TIMEOUT_MS = 20000;
const MAX_PROJECTS = 20;
const PROJECT_CONCURRENCY = 3;
const COMPLETED_BUILDS = 10;
const COMPLETED_PULL_REQUESTS = 10;
const MAX_WORK_ITEMS = 50;
const MAX_DEFINITIONS = 50;
const SCOPES = { BUILD: 'build', CODE: 'code', WORK: 'work' };
// Work item states that mean "nothing left to do" in the stock processes
// (Basic, Agile, Scrum, CMMI).
const CLOSED_STATES = ['Closed', 'Done', 'Removed', 'Resolved', 'Completed', 'Cut'];
const WORK_ITEM_FIELDS = [
  'System.Id',
  'System.Title',
  'System.WorkItemType',
  'System.State',
  'System.ChangedDate',
  'System.CreatedDate',
];

class AzdoError extends Error {
  /**
   * @param {string} kind - auth | scope | not_found | rate_limit | forbidden | server | network | invalid.
   * @param {string} message - The message (never the token).
   * @param {object} [extra] - `{ status, resetAt }`.
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'AzdoError';
    this.kind = kind;
    this.status = extra.status ?? 0;
    this.resetAt = extra.resetAt ?? null;
  }
}

/**
 * @description Read the organization field: a name, a dev.azure.com or
 * visualstudio.com link (any page of it), or the address of a collection of
 * Azure DevOps Server.
 * @param {unknown} raw - The raw field.
 * @returns {{ baseUrl: string, organization: string }|null} The address
 * without a trailing slash, and the organization (or collection) name; null
 * when the field cannot be one.
 * @example
 * readOrganization('https://dev.azure.com/contoso/Web/_build'); // -> { baseUrl: 'https://dev.azure.com/contoso', organization: 'contoso' }
 */
function readOrganization(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return null;
  }
  if (/^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/.test(value)) {
    return { baseUrl: `${SERVICES_HOST}/${value}`, organization: value };
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const host = url.hostname.toLowerCase();
  if (host === 'dev.azure.com') {
    return segments[0] ? readOrganization(segments[0]) : null;
  }
  const legacy = /^([a-z0-9][a-z0-9-]*)\.visualstudio\.com$/.exec(host);
  if (legacy) {
    return readOrganization(legacy[1]);
  }
  // Azure DevOps Server: everything up to the first `_xxx` segment (a page or
  // the API), and at most `tfs/<collection>` or `<collection>`.
  const kept = [];
  for (const segment of segments) {
    if (segment.startsWith('_')) {
      break;
    }
    kept.push(segment);
  }
  const depth = kept[0]?.toLowerCase() === 'tfs' ? 2 : 1;
  const path = kept.slice(0, depth);
  if (path.length === 0) {
    return null;
  }
  const baseUrl = `${url.origin}/${path.map(encodeURIComponent).join('/')}`;
  return { baseUrl, organization: path[path.length - 1] };
}

/**
 * @description A non-negative number header, or null.
 * @param {Headers} headers - The headers.
 * @param {string} name - The header name.
 * @returns {number|null} The value.
 */
function numberHeader(headers, name) {
  const raw = headers?.get?.(name);
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * @description The web link of a pull request (the API gives only its API URL).
 * @param {string} baseUrl - The organization address.
 * @param {string} project - The project name.
 * @param {string} repository - The repository name.
 * @param {number} id - The pull request id.
 * @returns {string} The link.
 */
function pullRequestLink(baseUrl, project, repository, id) {
  return `${baseUrl}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repository)}/pullrequest/${id}`;
}

/**
 * @description The web link of a work item.
 * @param {string} baseUrl - The organization address.
 * @param {string} project - The project name.
 * @param {number} id - The work item id.
 * @returns {string} The link.
 */
function workItemLink(baseUrl, project, id) {
  return `${baseUrl}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}

/**
 * @description The WIQL query of the open work items assigned to the token's user.
 * @returns {string} The query.
 */
function assignedQuery() {
  const states = CLOSED_STATES.map((state) => `'${state}'`).join(', ');
  return (
    'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project' +
    ` AND [System.AssignedTo] = @Me AND [System.State] NOT IN (${states})` +
    ' ORDER BY [System.ChangedDate] DESC'
  );
}

/**
 * @description The Azure DevOps client.
 * @param {object} options - Options.
 * @param {Function} options.getToken - `() => string`.
 * @param {Function} options.getBaseUrl - `() => string|null`.
 * @param {Function} options.getUserAgent - `() => string`.
 * @param {Function} [options.fetch] - The fetch implementation (tests).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @returns {object} `{ round, queueBuild, throttledUntil }`.
 */
function createAzdoClient({
  getToken,
  getBaseUrl,
  getUserAgent,
  fetch = globalThis.fetch,
  now = () => Date.now(),
}) {
  let throttledUntil = null;

  /**
   * @description One request.
   * @param {string} path - The path under the organization, with its query.
   * @param {object} [options] - `{ method, body }`.
   * @returns {Promise<unknown>} The JSON answer.
   * @throws {AzdoError} On any failure.
   */
  async function request(path, { method = 'GET', body } = {}) {
    const token = getToken();
    if (!token) {
      throw new AzdoError('auth', 'No Azure DevOps token configured');
    }
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      throw new AzdoError('not_found', 'No Azure DevOps organization configured');
    }
    const separator = path.includes('?') ? '&' : '?';
    const headers = {
      Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
      Accept: 'application/json',
      'User-Agent': getUserAgent(),
      'X-TFS-FedAuthRedirect': 'Suppress',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
      response = await fetch(`${baseUrl}${path}${separator}api-version=${API_VERSION}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new AzdoError('network', `Azure DevOps unreachable: ${err.message}`);
    }
    const status = response.status;
    const retryAfter = numberHeader(response.headers, 'retry-after');
    if (retryAfter !== null && retryAfter > 0) {
      throttledUntil = Math.max(throttledUntil ?? 0, now() + retryAfter * 1000);
    }
    if (status === 401 || status === 203 || (status >= 300 && status < 400)) {
      throw new AzdoError('auth', `Azure DevOps refused the token (${status})`, { status });
    }
    if (status === 429) {
      const reset = numberHeader(response.headers, 'x-ratelimit-reset');
      throw new AzdoError('rate_limit', 'Azure DevOps answered 429', {
        status,
        resetAt:
          retryAfter !== null ? now() + retryAfter * 1000 : reset !== null ? reset * 1000 : null,
      });
    }
    if (status === 403) {
      throw new AzdoError('forbidden', 'Azure DevOps answered 403', { status });
    }
    if (status === 404) {
      throw new AzdoError('not_found', 'Azure DevOps answered 404', { status });
    }
    if (status >= 500) {
      throw new AzdoError('server', `Azure DevOps answered ${status}`, { status });
    }
    let json;
    try {
      json = await response.json();
    } catch {
      throw new AzdoError('invalid', `Azure DevOps sent no JSON (HTTP ${status})`, { status });
    }
    if (!response.ok) {
      throw new AzdoError('invalid', `Azure DevOps answered ${status}`, { status });
    }
    return json;
  }

  /**
   * @description A part of a project: null when the token may not read it
   * (scope missing) or the service is off in the project; other errors fail
   * the round.
   * @param {string} scope - A SCOPES value, recorded when refused.
   * @param {Set<string>} refused - The scopes refused this round.
   * @param {string} path - The path.
   * @param {object} [options] - `{ method, body }`.
   * @returns {Promise<unknown|null>} The answer.
   */
  async function part(scope, refused, path, options) {
    try {
      return await request(path, options);
    } catch (err) {
      if (['auth', 'forbidden'].includes(err.kind)) {
        refused.add(scope);
        return null;
      }
      if (err.kind === 'not_found') {
        return null;
      }
      throw err;
    }
  }

  /**
   * @description Who the token belongs to. connectionData is undocumented:
   * an instance that does not answer it leaves the user unknown.
   * @returns {Promise<{ id: string|null, name: string }>} The user.
   * @throws {AzdoError} `auth` for a refused token, `not_found` for an
   * unknown organization.
   */
  async function readUser() {
    let answer;
    try {
      answer = await request('/_apis/connectionData');
    } catch (err) {
      if (err.kind === 'invalid') {
        return { id: null, name: '' };
      }
      throw err;
    }
    const user = answer?.authenticatedUser ?? {};
    const id = typeof user.id === 'string' ? user.id : null;
    // The anonymous user of a public organization: the token was not used.
    if (!id || /^a{8}-a{4}-a{4}-a{4}-a{12}$/i.test(id)) {
      throw new AzdoError('auth', 'Azure DevOps answered as an anonymous user');
    }
    return {
      id,
      name: String(user.providerDisplayName ?? user.customDisplayName ?? ''),
    };
  }

  /**
   * @description The projects of the organization.
   * @returns {Promise<object[]>} The raw projects.
   */
  async function listProjects() {
    let answer;
    try {
      answer = await request('/_apis/projects?$top=200');
    } catch (err) {
      if (['auth', 'forbidden'].includes(err.kind)) {
        throw new AzdoError('scope', 'The token cannot list the projects', { status: err.status });
      }
      throw err;
    }
    return (Array.isArray(answer?.value) ? answer.value : []).filter(
      (project) => project && typeof project.id === 'string' && typeof project.name === 'string',
    );
  }

  /**
   * @description Read one project.
   * @param {object} project - The raw project (`id`, `name`).
   * @param {Set<string>} refused - The scopes refused this round.
   * @returns {Promise<object>} The raw parts (null when not readable).
   */
  async function readProject(project, refused) {
    const base = `/${encodeURIComponent(project.id)}/_apis`;
    const values = (answer) => (Array.isArray(answer?.value) ? answer.value : null);
    const definitions = await part(
      SCOPES.BUILD,
      refused,
      `${base}/build/definitions?includeLatestBuilds=true&queryOrder=lastModifiedDescending&$top=${MAX_DEFINITIONS}`,
    );
    const completed = await part(
      SCOPES.BUILD,
      refused,
      `${base}/build/builds?statusFilter=completed&queryOrder=finishTimeDescending&$top=${COMPLETED_BUILDS}`,
    );
    const running = await part(
      SCOPES.BUILD,
      refused,
      `${base}/build/builds?statusFilter=inProgress&$top=100`,
    );
    const active = await part(
      SCOPES.CODE,
      refused,
      `${base}/git/pullrequests?searchCriteria.status=active&$top=100`,
    );
    const merged = await part(
      SCOPES.CODE,
      refused,
      `${base}/git/pullrequests?searchCriteria.status=completed&$top=${COMPLETED_PULL_REQUESTS}`,
    );
    const query = await part(SCOPES.WORK, refused, `${base}/wit/wiql?$top=${MAX_WORK_ITEMS}`, {
      method: 'POST',
      body: { query: assignedQuery() },
    });
    let workItems = null;
    if (query) {
      const ids = (Array.isArray(query.workItems) ? query.workItems : [])
        .map((item) => item?.id)
        .filter(Number.isInteger)
        .slice(0, MAX_WORK_ITEMS);
      workItems = [];
      if (ids.length > 0) {
        const answer = await part(
          SCOPES.WORK,
          refused,
          `${base}/wit/workitems?ids=${ids.join(',')}&fields=${WORK_ITEM_FIELDS.join(',')}&errorPolicy=Omit`,
        );
        workItems = values(answer)?.filter(Boolean) ?? null;
      }
    }
    return {
      project,
      definitions: values(definitions),
      completedBuilds: values(completed),
      runningBuilds: values(running),
      activePullRequests: values(active),
      completedPullRequests: values(merged),
      workItems,
    };
  }

  /**
   * @description Choose the followed projects among those of the organization.
   * @param {object[]} projects - The raw projects.
   * @param {string[]} wanted - Names (or GUIDs); empty for all.
   * @returns {{ chosen: object[], missing: string[] }} The projects, in the
   * configured order (by name for all), and the names not found.
   */
  function choose(projects, wanted) {
    if (wanted.length === 0) {
      const sorted = projects
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      return { chosen: sorted.slice(0, MAX_PROJECTS), missing: [] };
    }
    const chosen = [];
    const missing = [];
    wanted.forEach((name) => {
      const key = name.toLowerCase();
      const found = projects.find(
        (project) => project.name.toLowerCase() === key || project.id.toLowerCase() === key,
      );
      if (!found) {
        missing.push(name);
      } else if (!chosen.includes(found)) {
        chosen.push(found);
      }
    });
    return { chosen: chosen.slice(0, MAX_PROJECTS), missing };
  }

  /**
   * @description Read the user, the projects and every followed project.
   * @param {string[]} wanted - The configured projects (empty for all).
   * @returns {Promise<object>} `{ user, projects: object[], missing: string[],
   * total: number, refused: string[] }`, projects in the followed order.
   */
  async function round(wanted) {
    const user = await readUser();
    const all = await listProjects();
    const { chosen, missing } = choose(all, wanted);
    const refused = new Set();
    const projects = [];
    for (let start = 0; start < chosen.length; start += PROJECT_CONCURRENCY) {
      const slice = chosen.slice(start, start + PROJECT_CONCURRENCY);
      projects.push(...(await Promise.all(slice.map((project) => readProject(project, refused)))));
    }
    return {
      user,
      projects,
      missing,
      total: all.length,
      refused: Object.values(SCOPES).filter((scope) => refused.has(scope)),
    };
  }

  /**
   * @description Queue a run of a pipeline (scope Build: read & execute).
   * @param {string} projectId - The project GUID.
   * @param {number} definitionId - The pipeline (build definition) id.
   * @param {string} [branch] - The branch, `main` or `refs/heads/main`;
   * empty for the default branch of the pipeline.
   * @returns {Promise<object>} The raw queued build.
   */
  async function queueBuild(projectId, definitionId, branch) {
    const body = { definition: { id: definitionId } };
    if (branch) {
      body.sourceBranch = branch.startsWith('refs/') ? branch : `refs/heads/${branch}`;
    }
    return request(`/${encodeURIComponent(projectId)}/_apis/build/builds`, {
      method: 'POST',
      body,
    });
  }

  return {
    round,
    queueBuild,
    /** @returns {number|null} Until when Azure DevOps asked to slow down, in ms. */
    throttledUntil: () => (throttledUntil && throttledUntil > now() ? throttledUntil : null),
  };
}

/**
 * @description The User-Agent of the integration.
 * @param {{ name: string, version: string, homepage: string }} pkg - package.json fields.
 * @returns {string} The User-Agent.
 * @example
 * buildUserAgent({ name: 'gladys-azure-devops', version: '0.1.0', homepage: 'https://…' });
 */
function buildUserAgent({ name, version, homepage }) {
  return `${name}/${version} (+${homepage})`;
}

export {
  API_VERSION,
  MAX_PROJECTS,
  PROJECT_CONCURRENCY,
  COMPLETED_BUILDS,
  MAX_WORK_ITEMS,
  SCOPES,
  CLOSED_STATES,
  AzdoError,
  readOrganization,
  pullRequestLink,
  workItemLink,
  assignedQuery,
  buildUserAgent,
  createAzdoClient,
};
