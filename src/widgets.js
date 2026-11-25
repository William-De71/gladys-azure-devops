// -----------------------------------------------------------------------------
// Dashboard widgets of the Azure DevOps integration.
//
//   - `overview`       pull requests to review, my work items, failed
//                      pipelines and running builds, of one project or all,
//                      with the last finished run;
//   - `pipelines`      the pipelines of a project and their last run;
//   - `pull_requests`  the active pull requests (all, to review, or mine);
//   - `work_items`     the open work items assigned to the token's user.
//
// The contents come from the snapshots of the last round: a widget never
// costs an Azure DevOps call. Every text exists in the four languages (the
// content is cached per language).
// -----------------------------------------------------------------------------

import { countersOf } from './read.js';
import { t, ago } from './i18n.js';

const WIDGETS = {
  OVERVIEW: 'overview',
  PIPELINES: 'pipelines',
  PULL_REQUESTS: 'pull_requests',
  WORK_ITEMS: 'work_items',
};

const PULL_REQUEST_FILTERS = ['all', 'to_review', 'mine'];
const LIST_COUNT = { min: 1, max: 8, default: 6 };
const TTL = { min: 30, max: 3600, message: 300 };

const RESULT_COLORS = {
  succeeded: 'success',
  partiallySucceeded: 'warning',
  failed: 'danger',
  canceled: 'neutral',
};

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const httpsLink = (url) => (typeof url === 'string' && url.startsWith('https://') ? url : null);

/**
 * @description The freshness of a content: the poll interval, bounded.
 * @param {number} pollSeconds - The poll interval.
 * @returns {number} The TTL in seconds.
 */
function ttlOf(pollSeconds) {
  return Math.min(TTL.max, Math.max(TTL.min, Math.round(pollSeconds)));
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds = LIST_COUNT) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('No project');
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The caption naming the projects a list covers.
 * @param {object[]} projects - The projects.
 * @param {string} language - The language.
 * @returns {object} The caption component.
 */
function scopeCaption(projects, language) {
  return {
    type: 'text',
    variant: 'caption',
    text: clip(
      projects.length === 1
        ? projects[0].name
        : t('allProjects', language, { count: projects.length }),
      80,
    ),
  };
}

/**
 * @description The sum of a counter over projects, null when no project knows it.
 * @param {object[]} projects - The projects.
 * @param {string} key - The countersOf key.
 * @returns {number|null} The sum.
 */
function sum(projects, key) {
  const known = projects.map((project) => countersOf(project)[key]).filter(Number.isInteger);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/**
 * @description "12 min ago" for an instant, '' when unknown. A card-list item
 * shows its `subtitle` (60 characters), and its `date` would replace it: the
 * time goes in the text. The `description` opens on a click, with the link.
 * @param {number|null} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function when(instant, now, language) {
  return Number.isFinite(instant) && Number.isFinite(now) ? ago(instant, now, language) : '';
}

const tile = (value) => (Number.isInteger(value) ? value : '–');

/**
 * @description The `overview` widget.
 * @param {object} options - Options.
 * @param {object[]} options.projects - The projects to count (one or all).
 * @param {string} options.title - The heading (project or organization).
 * @param {string} options.url - The Azure DevOps page to open.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The poll interval.
 * @returns {object} The content.
 * @example
 * buildOverviewWidget({ projects, title: 'contoso', url, language: 'fr', now: Date.now(), pollSeconds: 120 });
 */
function buildOverviewWidget({ projects, title, url, language, now, pollSeconds }) {
  const failed = sum(projects, 'failedPipelines');
  const components = [
    { type: 'text', variant: 'heading', text: clip(title, 40) },
    {
      type: 'value',
      value: tile(sum(projects, 'toReview')),
      label: t('toReview', language),
      icon: 'git-pull-request',
      color: 'primary',
    },
    {
      type: 'value',
      value: tile(sum(projects, 'myWorkItems')),
      label: t('myWorkItems', language),
      icon: 'clipboard',
      color: 'info',
    },
    {
      type: 'value',
      value: tile(failed),
      label: t('failedPipelines', language),
      icon: 'x-circle',
      color: failed > 0 ? 'danger' : 'success',
    },
    {
      type: 'value',
      value: tile(sum(projects, 'runningBuilds')),
      label: t('runningBuilds', language),
      icon: 'play-circle',
    },
  ];
  const last = projects
    .flatMap((project) => (project.builds?.[0] ? [project.builds[0]] : []))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];
  if (last?.result) {
    const when = Number.isFinite(last.finishedAt)
      ? ` · ${ago(last.finishedAt, now, language)}`
      : '';
    components.push({
      type: 'status',
      items: [
        {
          label: clip(t('lastRun', language, { pipeline: last.pipeline }), 40),
          value: clip(`${t(`result_${last.result}`, language)}${when}`, 40),
          color: RESULT_COLORS[last.result],
        },
      ],
    });
  }
  const link = httpsLink(url);
  if (link) {
    components.push({
      type: 'button',
      label: t('openAzureDevOps', language),
      icon: 'external-link',
      style: 'secondary',
      link: { url: link },
    });
  }
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The run a pipeline shows: the one running, else the last finished.
 * @param {object} pipeline - The pipeline.
 * @returns {object|null} The run.
 */
function shownRun(pipeline) {
  const latest = pipeline.latest;
  if (latest && latest.status !== 'completed') {
    return latest;
  }
  return pipeline.lastCompleted ?? latest ?? null;
}

/**
 * @description The `pipelines` widget.
 * @param {object} options - Options.
 * @param {object} options.project - The project snapshot.
 * @param {string} options.language - The user language.
 * @param {object} [options.settings] - `{ count }`.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The poll interval.
 * @returns {object} The content.
 */
function buildPipelinesWidget({ project, language, settings = {}, now, pollSeconds }) {
  const caption = scopeCaption([project], language);
  if (!project.pipelines) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [caption, { type: 'text', variant: 'body', text: t('noBuildAccess', language) }],
    };
  }
  const rows = project.pipelines
    .filter((pipeline) => !pipeline.disabled)
    .map((pipeline) => ({ pipeline, run: shownRun(pipeline) }))
    .filter((row) => row.run)
    .sort(
      (a, b) =>
        (b.run.finishedAt ?? b.run.queuedAt ?? 0) - (a.run.finishedAt ?? a.run.queuedAt ?? 0),
    )
    .slice(0, readCount(settings.count));
  if (rows.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [caption, { type: 'text', variant: 'body', text: t('noPipeline', language) }],
    };
  }
  const items = rows.map(({ pipeline, run }) => {
    const running = run.status !== 'completed';
    const date = running ? run.queuedAt : run.finishedAt;
    const ago = when(date, now, language);
    const item = {
      title: clip(pipeline.name, 60),
      subtitle: clip([`#${run.number}`, run.branch, ago].filter(Boolean).join(' · '), 60),
      description: clip(
        [`#${run.number}`, run.branch, run.requestedBy, ago].filter(Boolean).join(' · '),
        2000,
      ),
      badge: running
        ? { text: clip(t('running', language), 16), color: 'info' }
        : {
            text: clip(t(`result_${run.result}`, language), 16),
            color: RESULT_COLORS[run.result] ?? 'neutral',
          },
    };
    const link = httpsLink(run.url);
    if (link) {
      item.links = [{ url: link, label: 'Azure DevOps' }];
    }
    return item;
  });
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [caption, { type: 'card-list', display: 'list', items }],
  };
}

/**
 * @description The badge of a pull request.
 * @param {object} pull - The pull request.
 * @param {string} language - The language.
 * @returns {{ text: string, color: string }} The badge.
 */
function pullRequestBadge(pull, language) {
  if (pull.draft) {
    return { text: t('badgeDraft', language), color: 'neutral' };
  }
  if (pull.rejected) {
    return { text: t('badgeRejected', language), color: 'danger' };
  }
  if (pull.toReview) {
    return { text: t('badgeToReview', language), color: 'warning' };
  }
  if (pull.waiting) {
    return { text: t('badgeWaiting', language), color: 'warning' };
  }
  if (pull.approvals > 0) {
    return { text: t('badgeApproved', language, { n: pull.approvals }), color: 'success' };
  }
  return { text: t('badgeActive', language), color: 'primary' };
}

/**
 * @description The `pull_requests` widget.
 * @param {object} options - Options.
 * @param {object[]} options.projects - The projects to list (one or all).
 * @param {string} options.language - The user language.
 * @param {object} [options.settings] - `{ filter, count }`.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The poll interval.
 * @returns {object} The content.
 */
function buildPullRequestsWidget({ projects, language, settings = {}, now, pollSeconds }) {
  const filter = PULL_REQUEST_FILTERS.includes(settings.filter) ? settings.filter : 'all';
  const caption = scopeCaption(projects, language);
  const readable = projects.filter((project) => project.pullRequests);
  if (readable.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [caption, { type: 'text', variant: 'body', text: t('noCodeAccess', language) }],
    };
  }
  const keep = {
    all: () => true,
    to_review: (pull) => pull.toReview,
    mine: (pull) => pull.mine,
  }[filter];
  const pulls = readable
    .flatMap((project) =>
      project.pullRequests.filter(keep).map((pull) => ({ pull, project: project.name })),
    )
    .sort((a, b) => (b.pull.createdAt ?? 0) - (a.pull.createdAt ?? 0))
    .slice(0, readCount(settings.count));
  if (pulls.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [
        caption,
        { type: 'text', variant: 'body', text: t(`noPullRequest_${filter}`, language) },
      ],
    };
  }
  const items = pulls.map(({ pull, project }) => {
    const badge = pullRequestBadge(pull, language);
    const where = readable.length > 1 ? `${project} / ${pull.repository}` : pull.repository;
    const ago = when(pull.createdAt, now, language);
    const item = {
      title: clip(`!${pull.id} ${pull.title}`, 60),
      subtitle: clip([where, pull.author, ago].filter(Boolean).join(' · '), 60),
      description: clip(
        [
          t('pullRequestLine', language, {
            repository: where,
            source: pull.source,
            target: pull.target,
            author: pull.author || '?',
          }),
          ago,
        ]
          .filter(Boolean)
          .join(' · '),
        2000,
      ),
      badge: { text: clip(badge.text, 16), color: badge.color },
    };
    const link = httpsLink(pull.url);
    if (link) {
      item.links = [{ url: link, label: 'Azure DevOps' }];
    }
    return item;
  });
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [caption, { type: 'card-list', display: 'list', items }],
  };
}

/**
 * @description The `work_items` widget.
 * @param {object} options - Options.
 * @param {object[]} options.projects - The projects to list (one or all).
 * @param {string} options.language - The user language.
 * @param {object} [options.settings] - `{ count }`.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The poll interval.
 * @returns {object} The content.
 */
function buildWorkItemsWidget({ projects, language, settings = {}, now, pollSeconds }) {
  const caption = scopeCaption(projects, language);
  const readable = projects.filter((project) => project.workItems);
  if (readable.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [caption, { type: 'text', variant: 'body', text: t('noWorkAccess', language) }],
    };
  }
  const entries = readable
    .flatMap((project) => project.workItems.map((item) => ({ item, project: project.name })))
    .sort((a, b) => (b.item.changedAt ?? 0) - (a.item.changedAt ?? 0))
    .slice(0, readCount(settings.count));
  if (entries.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [caption, { type: 'text', variant: 'body', text: t('noWorkItem', language) }],
    };
  }
  const items = entries.map(({ item, project }) => {
    const line = [
      item.state,
      readable.length > 1 ? project : '',
      when(item.changedAt, now, language),
    ]
      .filter(Boolean)
      .join(' · ');
    const entry = {
      title: clip(`#${item.id} ${item.title}`, 60),
      subtitle: clip(line, 60),
      description: clip(`${item.type}: ${item.title} · ${line}`, 2000),
      badge: { text: clip(item.type || '?', 16), color: 'info' },
    };
    const link = httpsLink(item.url);
    if (link) {
      entry.links = [{ url: link, label: 'Azure DevOps' }];
    }
    return entry;
  });
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [caption, { type: 'card-list', display: 'list', items }],
  };
}

export {
  WIDGETS,
  PULL_REQUEST_FILTERS,
  LIST_COUNT,
  RESULT_COLORS,
  messageContent,
  readCount,
  buildOverviewWidget,
  buildPipelinesWidget,
  buildPullRequestsWidget,
  buildWorkItemsWidget,
};
