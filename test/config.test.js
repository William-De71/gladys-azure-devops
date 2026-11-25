import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, parseProjects, readLanguage, POLL_INTERVAL } from '../src/config.js';
import { MAX_PROJECTS } from '../src/azdo-api.js';

test('defaults: no organization, no token, every project, 120 s, automatic language', () => {
  assert.deepEqual(normalizeConfig(), {
    baseUrl: null,
    organization: '',
    token: '',
    projects: [],
    pollInterval: POLL_INTERVAL.default,
    language: 'auto',
  });
  assert.deepEqual(normalizeConfig(null).projects, []);
});

test('organization, token without spaces, bounded interval, language', () => {
  const config = normalizeConfig({
    organization: 'https://dev.azure.com/contoso/Web',
    token: ' abc\ndef ',
    poll_interval: '30',
    language: 'de',
  });
  assert.equal(config.baseUrl, 'https://dev.azure.com/contoso');
  assert.equal(config.organization, 'contoso');
  assert.equal(config.token, 'abcdef');
  assert.equal(config.pollInterval, POLL_INTERVAL.min);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ poll_interval: 99999 }).pollInterval, POLL_INTERVAL.max);
  assert.equal(normalizeConfig({ poll_interval: 'abc' }).pollInterval, POLL_INTERVAL.default);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
});

test('projects: names with spaces, links, duplicates and invalid names, capped', () => {
  assert.deepEqual(
    parseProjects(
      'Web, Mobile App; web\nhttps://dev.azure.com/contoso/Data%20Lake/_boards, bad/name, _hidden,  ',
    ),
    ['Web', 'Mobile App', 'Data Lake'],
  );
  assert.deepEqual(parseProjects('https://tfs.example.com/tfs/Main/Legacy/_git/app'), ['Legacy']);
  assert.equal(
    parseProjects(Array.from({ length: 30 }, (_, i) => `P${i}`).join(',')).length,
    MAX_PROJECTS,
  );
  assert.deepEqual(parseProjects(undefined), []);
});

test('the stored language of the last widget request', () => {
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'english' }, 'fr'), 'fr');
  assert.equal(readLanguage(undefined, 'en'), 'en');
});
