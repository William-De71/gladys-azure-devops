// -----------------------------------------------------------------------------
// The Azure DevOps integration: every handler, registered on a Gladys client.
//
// Follows the projects of an Azure DevOps organization (Services, or Server
// 2022.1 and later) and brings them into Gladys:
//   - a device per project (Discovery screen): active pull requests, those
//     waiting for the user's vote, the user's open work items, failed
//     pipelines, running builds, the last run and pull request (device.js);
//   - scene triggers: run completed, pull request created, review requested,
//     pull request completed, work item assigned (tracker.js, events.js);
//   - scene actions: read a project's figures, run a pipeline
//     (scene-actions.js);
//   - dashboard widgets: overview, pipelines, pull requests, work items
//     (widgets.js).
//
// Azure DevOps service hooks need a public endpoint: the integration reads
// the REST API on its own timer (azdo-api.js) with a personal access token.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createAzdoClient, buildUserAgent } from './azdo-api.js';
import { createWatcher } from './watcher.js';
import {
  DEVICE_TYPES,
  idsOf,
  idFromExternalId,
  buildProjectDevice,
  buildProjectStates,
} from './device.js';
import { buildSceneEvent } from './events.js';
import {
  SCENE_ACTIONS,
  buildProjectOutputs,
  findPipeline,
  buildRunOutputs,
} from './scene-actions.js';
import {
  WIDGETS,
  messageContent,
  buildOverviewWidget,
  buildPipelinesWidget,
  buildPullRequestsWidget,
  buildWorkItemsWidget,
} from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const { name, version, homepage } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ACTIONS = { TEST_CONNECTION: 'test_connection' };
// A widget or a scene action reuses the last round while it is this fresh.
const SNAPSHOT_MAX_AGE_MS = 60000;
// The longest list of missing projects a status message names.
const MAX_MISSING_LISTED = 3;
// The longest status or Configuration screen message, per language.
const MAX_MESSAGE = 200;

/**
 * @description Join multi-language parts into one message, per language,
 * cut at MAX_MESSAGE characters.
 * @param {object[]} parts - Multi-language messages.
 * @returns {object} The message.
 */
function joinParts(parts) {
  return Object.fromEntries(
    LANGUAGES.map((lang) => {
      const text = parts.map((part) => part[lang]).join(' ');
      return [lang, text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text];
    }),
  );
}

/**
 * @description The "scopes missing" message.
 * @param {string[]} refused - The refused scopes.
 * @returns {object} The message.
 */
function refusedMessage(refused) {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      t('statusRefused', lang, {
        scopes: refused.map((scope) => t(`scope_${scope}`, lang)).join(', '),
      }),
    ]),
  );
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - fetch implementation (tests).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, getConfig: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  { fetchImpl = globalThis.fetch, now = () => Date.now(), logger = sdkLogger } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device external ids the user created (states are only published for them).
  let createdDevices = new Set();
  // Last connection status sent, to send it again only when it changes.
  let lastStatus = null;

  const azdo = createAzdoClient({
    getToken: () => config.token,
    getBaseUrl: () => config.baseUrl,
    getUserAgent: () => buildUserAgent({ name, version, homepage }),
    fetch: fetchImpl,
    now,
  });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language
   * (device names, scene summaries and outputs).
   * @returns {string} The language.
   */
  function textLanguage() {
    return config.language === AUTO_LANGUAGE ? language : config.language;
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The message saying what is missing in the configuration, or null.
   * @returns {object|null} The message.
   */
  function missingSetting() {
    if (!config.baseUrl) {
      return all('noOrganization');
    }
    if (!config.token) {
      return all('noToken');
    }
    return null;
  }

  /**
   * @description The multi-language message of a failed read.
   * @param {Error} err - An AzdoError.
   * @returns {object} The message.
   */
  function errorMessage(err) {
    switch (err.kind) {
      case 'auth':
        return missingSetting() ?? all('statusInvalidToken');
      case 'scope':
        return all('statusNoProjectScope');
      case 'not_found':
        return missingSetting() ?? all('statusUnknownOrganization', { url: config.baseUrl });
      case 'forbidden':
        return all('statusForbidden');
      case 'rate_limit':
        return all('statusRateLimited');
      default:
        return all('statusUnreachable');
    }
  }

  /**
   * @description `a, b, c (+2)` style list.
   * @param {string[]} names - The names.
   * @returns {string} The list.
   */
  function listOf(names) {
    const shown = names.slice(0, MAX_MISSING_LISTED).join(', ');
    return names.length > MAX_MISSING_LISTED
      ? `${shown} (+${names.length - MAX_MISSING_LISTED})`
      : shown;
  }

  /**
   * @description The status of a successful round, in every language.
   * @param {object} round - The round.
   * @returns {object} The message.
   */
  function roundMessage(round) {
    const parts = [
      all('statusConnected', {
        user: round.user?.name || '?',
        organization: config.organization,
        count: round.projects.length,
      }),
    ];
    if (round.missing.length > 0) {
      parts.push(all('statusMissing', { missing: listOf(round.missing) }));
    }
    if (round.refused.length > 0) {
      parts.push(refusedMessage(round.refused));
    }
    return joinParts(parts);
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Publish the states of the created devices that changed. The
   * SDK remembers what it sent (publishChangedStates) and forgets a device when
   * the user creates it: its states then go out again in full.
   * @param {object[]} projects - Project snapshots.
   * @returns {Promise<void>}
   */
  async function publishStates(projects) {
    const states = projects
      .filter((project) =>
        createdDevices.has(idsOf(gladys, DEVICE_TYPES.PROJECT, project.id).device),
      )
      .flatMap((project) => buildProjectStates(gladys, project, textLanguage()));
    if (states.length > 0) {
      await gladys.publishChangedStates(states);
    }
  }

  /**
   * @description Ask the dashboards to re-read the widgets.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    azdo,
    getProjects: () => config.projects,
    getBaseUrl: () => config.baseUrl,
    isEnabled: () => !missingSetting(),
    getIntervalMs: () => config.pollInterval * 1000,
    onRound: async (round) => {
      for (const { snapshot, events } of round.projects) {
        for (const event of events) {
          const { key, data } = buildSceneEvent(gladys, snapshot, event, textLanguage());
          logger.info(`${snapshot.name}: ${key}`);
          try {
            await gladys.publishSceneEvent(key, data);
          } catch (err) {
            logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
          }
        }
      }
      const changed = round.projects.filter((entry) => entry.changed).map((e) => e.snapshot);
      if (changed.length > 0) {
        await publishStates(changed).catch((err) =>
          logger.warn(`Unable to publish the states: ${err.message}`),
        );
        refreshWidgets();
      }
      if (round.missing.length > 0) {
        logger.warn(`Projects not found or not visible: ${round.missing.join(', ')}`);
      }
      if (round.refused.length > 0) {
        logger.warn(`Scopes missing on the token: ${round.refused.join(', ')}`);
      }
      await reportStatus(true, roundMessage(round));
    },
    onError: async (err) => {
      await reportStatus(false, errorMessage(err));
    },
    now,
    logger,
  });

  /**
   * @description Offer every project read on the Discovery screen.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices() {
    const devices = missingSetting()
      ? []
      : watcher.projects().map((project) => buildProjectDevice(gladys, project, textLanguage()));
    await gladys.publishDiscoveredDevices(devices);
    return devices.length;
  }

  // --- Projects of the widgets and scene actions -------------------------------------

  /**
   * @description The project a device select points to.
   * @param {unknown} deviceExternalId - The `source: "devices"` value.
   * @returns {object|null} The snapshot, null when none is chosen or known.
   */
  function chosenProject(deviceExternalId) {
    const id = idFromExternalId(deviceExternalId);
    return id ? (watcher.projects().find((project) => project.id === id) ?? null) : null;
  }

  /**
   * @description The projects a widget lists: the chosen one, else all.
   * @param {unknown} deviceExternalId - The `source: "devices"` value.
   * @returns {object[]} The snapshots.
   */
  function widgetProjects(deviceExternalId) {
    const chosen = chosenProject(deviceExternalId);
    return chosen ? [chosen] : watcher.projects();
  }

  /**
   * @description The content explaining why a widget has nothing to show, or null.
   * @param {string} lang - The user language.
   * @returns {object|null} The content.
   */
  function widgetBlocker(lang) {
    if (!config.baseUrl) {
      return messageContent(t('noOrganization', lang));
    }
    if (!config.token) {
      return messageContent(t('noToken', lang));
    }
    if (watcher.fetchedAt() === null) {
      return messageContent(t('notReadYet', lang), 30);
    }
    if (watcher.projects().length === 0) {
      return messageContent(t('noProject', lang));
    }
    return null;
  }

  // --- Dashboard widgets -------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const blocker = widgetBlocker(lang);
    if (blocker) {
      return blocker;
    }
    const chosen = chosenProject(settings.project);
    return buildOverviewWidget({
      projects: chosen ? [chosen] : watcher.projects(),
      title: chosen ? chosen.name : config.organization,
      url: chosen ? chosen.url : config.baseUrl,
      language: lang,
      now: now(),
      pollSeconds: config.pollInterval,
    });
  });

  gladys.onWidgetGet(WIDGETS.PIPELINES, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const blocker = widgetBlocker(lang);
    if (blocker) {
      return blocker;
    }
    return buildPipelinesWidget({
      project: chosenProject(settings.project) ?? watcher.projects()[0],
      language: lang,
      settings,
      now: now(),
      pollSeconds: config.pollInterval,
    });
  });

  gladys.onWidgetGet(WIDGETS.PULL_REQUESTS, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const blocker = widgetBlocker(lang);
    if (blocker) {
      return blocker;
    }
    return buildPullRequestsWidget({
      projects: widgetProjects(settings.project),
      language: lang,
      settings,
      now: now(),
      pollSeconds: config.pollInterval,
    });
  });

  gladys.onWidgetGet(WIDGETS.WORK_ITEMS, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const blocker = widgetBlocker(lang);
    if (blocker) {
      return blocker;
    }
    return buildWorkItemsWidget({
      projects: widgetProjects(settings.project),
      language: lang,
      settings,
      now: now(),
      pollSeconds: config.pollInterval,
    });
  });

  // --- Scene actions -----------------------------------------------------------------

  /**
   * @description The project a scene action targets, fresh enough.
   * @param {unknown} deviceExternalId - The `project` field.
   * @returns {Promise<object>} The snapshot.
   * @throws {Error} When nothing is configured or the project is unknown.
   */
  async function actionProject(deviceExternalId) {
    if (missingSetting()) {
      throw new Error('Azure DevOps is not configured (organization and token)');
    }
    if (watcher.fetchedAt() === null) {
      await watcher.round();
    }
    const target = chosenProject(deviceExternalId) ?? watcher.projects()[0];
    if (!target) {
      throw new Error('No Azure DevOps project is followed, or it has not been read yet');
    }
    return (await watcher.get(target.id, SNAPSHOT_MAX_AGE_MS)) ?? target;
  }

  gladys.onSceneAction(SCENE_ACTIONS.GET_PROJECT, async (fields) => {
    const project = await actionProject(fields.project);
    return buildProjectOutputs(project, textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.RUN_PIPELINE, async (fields) => {
    const project = await actionProject(fields.project);
    if (!project.pipelines) {
      throw new Error('The token cannot read the pipelines of this project (scope Build)');
    }
    const { pipeline, ambiguous } = findPipeline(project.pipelines, fields.pipeline);
    if (!pipeline) {
      throw new Error(
        ambiguous
          ? `Several pipelines are named "${fields.pipeline}": give its folder or its id`
          : `No pipeline "${fields.pipeline}" in ${project.name}`,
      );
    }
    const branch = typeof fields.branch === 'string' ? fields.branch.trim() : '';
    const queued = await azdo.queueBuild(project.id, pipeline.id, branch);
    logger.info(`${project.name}: run of ${pipeline.name} queued`);
    return buildRunOutputs(project, pipeline, queued, textLanguage());
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    const missing = missingSetting();
    if (missing) {
      return missing;
    }
    let answer;
    try {
      answer = await azdo.round(config.projects);
    } catch (err) {
      return errorMessage(err);
    }
    const parts = [
      all('testOk', {
        user: answer.user?.name || '?',
        organization: config.organization,
        count: answer.projects.length,
        total: answer.total,
      }),
    ];
    if (answer.missing.length > 0) {
      parts.push(all('statusMissing', { missing: listOf(answer.missing) }));
    }
    if (answer.refused.length > 0) {
      parts.push(refusedMessage(answer.refused));
    }
    return joinParts(parts);
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await watcher.round();
    const count = await publishDiscoveredDevices();
    logger.info(`Scan: ${count} Azure DevOps device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishStates(watcher.projects()).catch((err) =>
      logger.warn(`Unable to publish the states: ${err.message}`),
    );
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read Azure DevOps now and offer the devices; report a
   * missing setting.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    const missing = missingSetting();
    if (missing) {
      await reportStatus(false, missing);
    }
    await watcher.round();
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previous = `${config.baseUrl}|${config.token}`;
    await loadConfig(rawConfig);
    logger.info(
      `Configuration updated: ${config.baseUrl ?? 'no organization'}, ${
        config.projects.length || 'all'
      } project(s), read every ${config.pollInterval} s`,
    );
    if (`${config.baseUrl}|${config.token}` !== previous) {
      // Maybe another organization or user: start again from a fresh baseline.
      watcher.reset();
    }
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  gladys.on('connected', async () => {
    await loadConfig();
    await refreshCreatedDevices();
    lastStatus = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
  });

  return { watcher, getConfig: () => config };
}

export { createApp };
