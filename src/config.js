// -----------------------------------------------------------------------------
// Configuration of the Azure DevOps integration.
//
// Fields of the config_schema:
//   - `organization`   the organization: its name (`contoso`), any link of it
//                      (dev.azure.com or visualstudio.com), or the address of
//                      an Azure DevOps Server collection;
//   - `token`          a personal access token (PAT);
//   - `projects`       the projects to follow, by name, separated by commas;
//                      empty: every project (the first 20 by name);
//   - `poll_interval`  how often Azure DevOps is read, in seconds;
//   - `language`       language of the texts Gladys does not ask for in a
//                      language (device names, scene summaries): `auto`
//                      follows the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`  language of the last widget request, for the device
//                      names and the scene texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { MAX_PROJECTS, readOrganization } from './azdo-api.js';

const POLL_INTERVAL = { min: 60, max: 3600, default: 120 };
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
// Characters Azure DevOps refuses in a project name.
const FORBIDDEN = /[\\/:*?"<>|;#$%{}+=[\]]/;

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('300', POLL_INTERVAL); // -> 300
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Parse the projects field: names separated by commas,
 * semicolons or new lines (a name may hold spaces), a project link reduced to
 * its name, invalid entries dropped, duplicates removed (names are
 * case-insensitive), capped.
 * @param {unknown} raw - The raw field.
 * @returns {string[]} The project names, as typed.
 * @example
 * parseProjects('Web, Mobile App; web'); // -> ['Web', 'Mobile App']
 */
function parseProjects(raw) {
  const seen = new Set();
  const list = [];
  readString(raw)
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .map((entry) => {
      const link = /^https?:\/\/[^/]+\/(?:tfs\/)?[^/]+\/([^/?#]+)/i.exec(entry);
      if (!link) {
        return entry;
      }
      try {
        return decodeURIComponent(link[1]);
      } catch {
        return '';
      }
    })
    .filter((name) => name && name.length <= 64 && !FORBIDDEN.test(name) && !name.startsWith('_'))
    .forEach((name) => {
      const key = name.toLowerCase();
      if (!seen.has(key) && list.length < MAX_PROJECTS) {
        seen.add(key);
        list.push(name);
      }
    });
  return list;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ baseUrl: string|null, organization: string, token: string, projects: string[], pollInterval: number, language: string }}
 * The config (poll interval in seconds, language 'auto' or a language code).
 * @example
 * normalizeConfig({ organization: 'contoso', token: '…', projects: 'Web' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const organization = readOrganization(config.organization);
  return {
    baseUrl: organization?.baseUrl ?? null,
    organization: organization?.organization ?? '',
    // A token never holds spaces: a pasted one may carry a new line.
    token: readString(config.token).replace(/\s+/g, ''),
    projects: parseProjects(config.projects),
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  POLL_INTERVAL,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeConfig,
  parseProjects,
  readLanguage,
};
