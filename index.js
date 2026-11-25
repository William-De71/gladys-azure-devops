// -----------------------------------------------------------------------------
// Entry point of the Azure DevOps external integration.
//
// Follows the projects of an Azure DevOps organization (Services, or Server
// 2022.1 and later) and brings them into Gladys:
//   - a device per project (Discovery screen): pull requests to review, my
//     work items, failed pipelines, running builds, the last run;
//   - scene triggers: pipeline run completed, pull request created, review
//     requested, pull request completed, work item assigned;
//   - scene actions: read a project, run a pipeline;
//   - dashboard widgets: overview, pipelines, pull requests, work items.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Azure DevOps integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
