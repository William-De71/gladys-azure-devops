# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Azure DevOps (Azure DevOps
Services, or Azure DevOps Server 2022.1 and later): a Node.js service (Node
22+, ESM, no build step) that runs in its own sandboxed Docker container and
talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the official Azure DevOps REST API 7.1
(https://learn.microsoft.com/rest/api/azure/devops/) with a personal access
token (Basic header, empty user name): the user, the projects, then seven
small requests per followed project each round (up to 20 projects). It writes
only when the `run_pipeline` scene action queues a run. Never tested with a
real organization: the answer shapes come from the reference and from the
anonymous answers of a public organization (dnceng-public, read on
2026-11-25).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(): statuses,
                        discovery, states, widgets, scene actions, test button
src/azdo-api.js         REST 7.1 client: organization field, Basic auth, the
                        round (user, projects, parts), queueBuild, error kinds,
                        refused scopes, Retry-After / 429
src/read.js             answers -> plain project snapshots, countersOf()
src/watcher.js          the timer loop, snapshots, change detection
src/tracker.js          snapshots -> scene trigger transitions (pure logic),
                        mergeSnapshot (keep unread parts)
src/events.js           scene trigger payloads
src/device.js           one device per project, its features and states
src/scene-actions.js    get_project and run_pipeline outputs, findPipeline
src/widgets.js          overview, pipelines, pull_requests, work_items
src/config.js           configuration (organization, token, projects, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/helpers/fixtures.js  a fake Azure DevOps organization behind the `fetch` option
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (built on the project GUID, lowercase, never on its
  name), feature `category` / `type` / `unit` / `min` / `max` / `step`, the
  keys of `config_schema`, `actions`, widgets and their settings, scene
  triggers (fields, options, variables) and scene actions (fields, outputs).
  `test/structure.test.js` compares them to `test/fixtures/discovery.baseline.json`:
  never update the baseline to make a test pass without a documented migration.
- **`should_poll` stays false**: Azure DevOps is read on the integration's own
  timer (60 to 3600 s), beyond what Gladys polls. It never resyncs on existing
  devices.
- **A part the token cannot read is left out, never 0.** Once connectionData
  accepted the token, a 401 / 403 on a part means a missing scope (Build,
  Code, Work Items): the part is null, its features are not published, the
  scope is named in the status. A 404 on a part is a service turned off.
  Projects not listable = `scope` error (Project and Team).
- **`X-TFS-FedAuthRedirect: Suppress` and `redirect: 'manual'`**: a refused
  token answers 401 JSON instead of a 302 to the sign-in page; a 3xx or a 203
  is a refused token too. The anonymous user id (`aaaaaaaa-…`) means the token
  was not used: auth error.
- **The first round is a baseline**: no scene event replays history after a
  restart or a token change. A part not read keeps its previous value
  (`mergeSnapshot`) so a passing failure neither replays nor hides events.
- **Never fire a scene event from a scene action.** `run_pipeline` queues one
  run per call (no retry); the run's completion is seen by a later round like
  any other.
- **Be gentle with Azure DevOps**: one round per interval, widgets and actions
  read the snapshots (an action re-reads only when the last round is older
  than 60 s). `Retry-After` (even on a 200) and 429 push the next round back.
- **The container rootfs is read-only.** Write only under `/data` (nothing is
  stored today). Never log the token; it only goes to the configured
  organization, in the Basic header.
- **Card lists**: the front shows `subtitle` (60 characters) and a `date`
  would replace it: put the relative time in the subtitle, the full line in
  `description` (shown on click), never `date`.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. French says "vous", German "du",
  Spanish "usted". Status messages are cut at 200 characters.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language. A field older cores
  do not know needs a higher `gladys_version` minimum (see `src/constants.js`
  of the integration-store). Transport: `["cloud"]`. The Azure DevOps icon
  names the service only; keep the "not affiliated" notices.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- connectionData (`/_apis/connectionData`) is not in the REST reference: an
  instance that does not answer it in JSON leaves the user unknown, and the
  "to review" count and trigger stay off.
- The pull request answer has no web link: `pullRequestLink()` builds
  `<org>/<project>/_git/<repo>/pullrequest/<id>`; builds have
  `_links.web.href`.
- Work items: WIQL gives ids only (`$top` 50), then `wit/workitems?ids=`
  (200 at most) with `errorPolicy=Omit` (deleted ones come back null).
  "Open" means a state outside `CLOSED_STATES` of the stock processes.
- Build ids are given at queue time: a run queued earlier can finish later;
  new runs are found by id against the previous list, not by `id > max`.
- Azure DevOps Server below 2022.1 does not take api-version 7.1.
- `node --test` also runs `test/helpers/`: nothing starts on import.
