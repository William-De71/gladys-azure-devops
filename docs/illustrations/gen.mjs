// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The four widgets for two followed projects, on 2026-11-25 at 11:00 in
// Paris: the answers are the ones of the fake Azure DevOps of the tests
// (test/helpers/fixtures.js, shaped like the REST API 7.1 answers), read by
// the real reader (src/read.js) and drawn by the real widget builders
// (src/widgets.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildOverviewWidget, buildPipelinesWidget, buildPullRequestsWidget, buildWorkItemsWidget } =
  await load('src/widgets.js');
const { readProject } = await load('src/read.js');
const { LANGUAGES } = await load('src/i18n.js');
const {
  rawProject,
  rawDefinition,
  rawBuild,
  rawPullRequest,
  rawWorkItem,
  BASE_URL,
  BOB_ID,
  NOW,
  OTHER_ID,
  USER_ID,
} = await load('test/helpers/fixtures.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const MIN = 60000;
const HOUR = 60 * MIN;
const context = { baseUrl: BASE_URL, userId: USER_ID };
// Illustration: the software of a smart home, and its companion app.
const ci = rawBuild({
  id: 1201,
  number: '20261125.6',
  pipeline: 'CI',
  result: 'failed',
  finish: NOW - 12 * MIN,
  by: 'Chloé Martin',
});
const nightly = rawBuild({
  id: 1188,
  number: '20261125.1',
  pipelineId: 14,
  pipeline: 'Nightly tests',
  result: 'succeeded',
  finish: NOW - 7 * HOUR,
  by: 'Scheduler',
  reason: 'schedule',
});
const deploying = rawBuild({
  id: 1203,
  number: '20261125.7',
  pipelineId: 13,
  pipeline: 'Deploy',
  status: 'inProgress',
  queue: NOW - 4 * MIN,
  by: 'Ada Lovelace',
});
const deployed = rawBuild({
  id: 1170,
  number: '20261124.3',
  pipelineId: 13,
  pipeline: 'Deploy',
  result: 'succeeded',
  finish: NOW - 20 * HOUR,
});
const docs = rawBuild({
  id: 1150,
  number: '20261123.2',
  pipelineId: 15,
  pipeline: 'Docs site',
  result: 'partiallySucceeded',
  finish: NOW - 46 * HOUR,
  by: 'Bob Martin',
});
const home = readProject(
  rawProject({
    name: 'Smart Home',
    definitions: [
      rawDefinition({ latest: ci }),
      rawDefinition({ id: 13, name: 'Deploy', latest: deploying, lastCompleted: deployed }),
      rawDefinition({ id: 14, name: 'Nightly tests', latest: nightly }),
      rawDefinition({ id: 15, name: 'Docs site', latest: docs }),
    ],
    completed: [ci, nightly, deployed, docs],
    running: [deploying],
    active: [
      rawPullRequest({
        id: 218,
        title: 'Add the garden irrigation scene',
        author: 'Chloé Martin',
        repository: 'home-scenes',
        source: 'refs/heads/feature/irrigation',
        created: NOW - 35 * MIN,
      }),
      rawPullRequest({
        id: 215,
        title: 'Heat the bathroom before 7 am',
        author: 'Bob Martin',
        repository: 'home-scenes',
        source: 'refs/heads/feature/bathroom',
        created: NOW - 5 * HOUR,
        reviewers: [
          { id: USER_ID, vote: 0 },
          { id: 'c', vote: 10 },
        ],
      }),
      rawPullRequest({
        id: 211,
        title: 'Update the Zigbee firmware list',
        author: 'Ada Lovelace',
        authorId: USER_ID,
        repository: 'gateway',
        source: 'refs/heads/zigbee',
        created: NOW - 26 * HOUR,
        reviewers: [
          { id: BOB_ID, vote: 10 },
          { id: 'c', vote: 5 },
        ],
      }),
    ],
    workItems: [
      rawWorkItem({
        id: 4120,
        title: 'Shutters close too early in winter',
        type: 'Bug',
        state: 'Active',
        changed: NOW - 50 * MIN,
      }),
      rawWorkItem({
        id: 4098,
        title: 'Show the energy cost per room',
        type: 'User Story',
        state: 'New',
        changed: NOW - 6 * HOUR,
      }),
      rawWorkItem({
        id: 4077,
        title: 'Write the backup guide',
        type: 'Task',
        state: 'Active',
        changed: NOW - 30 * HOUR,
      }),
    ],
  }),
  context,
);
const app = readProject(
  rawProject({
    id: OTHER_ID,
    name: 'Mobile App',
    definitions: [
      rawDefinition({
        id: 21,
        name: 'Android build',
        latest: rawBuild({
          id: 1199,
          pipelineId: 21,
          pipeline: 'Android build',
          result: 'succeeded',
          finish: NOW - 2 * HOUR,
        }),
      }),
    ],
    completed: [
      rawBuild({
        id: 1199,
        pipelineId: 21,
        pipeline: 'Android build',
        result: 'succeeded',
        finish: NOW - 2 * HOUR,
      }),
    ],
    running: [],
    active: [
      rawPullRequest({
        id: 220,
        title: 'Dark mode for the widgets',
        author: 'Bob Martin',
        repository: 'mobile',
        source: 'refs/heads/dark-mode',
        created: NOW - 2 * HOUR,
        draft: true,
      }),
    ],
    merged: [],
    workItems: [
      rawWorkItem({
        id: 4131,
        title: 'Crash when the hub is offline',
        type: 'Bug',
        state: 'New',
        changed: NOW - 3 * HOUR,
      }),
    ],
  }),
  context,
);

const contents = {};
for (const language of LANGUAGES) {
  const common = { language, now: NOW, pollSeconds: 120 };
  contents[language] = {
    overview: buildOverviewWidget({
      ...common,
      projects: [home, app],
      title: 'contoso',
      url: BASE_URL,
      now: NOW,
    }),
    pipelines: buildPipelinesWidget({ ...common, project: home, settings: { count: 4 } }),
    pull_requests: buildPullRequestsWidget({
      ...common,
      projects: [home, app],
      settings: { count: 4 },
    }),
    work_items: buildWorkItemsWidget({ ...common, projects: [home, app], settings: { count: 4 } }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
