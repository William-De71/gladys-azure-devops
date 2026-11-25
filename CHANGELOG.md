# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-25

### Added

- **devices:** the projects of an Azure DevOps organization (Azure DevOps Services, or Azure DevOps Server 2022.1 and later) through the official REST API 7.1 with a personal access token; one device per project with active pull requests, pull requests waiting for your vote, your open work items, failed pipelines, running builds, the last pipeline run and the latest pull request
- **scenes:** triggers when a pipeline run completes (filters on result, pipeline and branch), a pull request is created, your review is requested, a pull request is completed, and a work item is assigned to you; actions that read a project and that run a pipeline, with ready-made sentences
- **widgets:** an overview of one project or all, the pipelines of a project with their last run, the active pull requests (all, to review, or yours), and your work items
- **configuration:** organization (name, link or Server collection), personal access token, projects (all by default), reading interval, language, "Test the connection" button that names the missing token scopes
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-azure-devops/releases/tag/v0.1.0
