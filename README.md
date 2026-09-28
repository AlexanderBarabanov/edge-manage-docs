# OpenVINO Documentation Hub

This repository builds and deploys OpenVINO documentation from registered product repositories.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for content conventions, local development, and instructions for adding a product repository.

## Architecture

The documentation system has two repository roles:

| Role | Responsibilities |
|---|---|
| Hub (`openvino.docs`) | Owns Docusaurus, shared components, configuration, builds, previews, and deployment. |
| Product repositories | Own their documentation content, images, and version snapshots. |

## Repository integration

[`spokes.yml`](spokes.yml) is the starting point for the architecture. It registers each product repository and defines:

- the repository and branch containing the content;
- the paths that the hub reads;
- the product identifier and published URL path;
- optional processing required before the build.

GitHub Apps provide authenticated communication between repositories. A workflow in a product repository sends a `repository_dispatch` event to the hub with the source repository and revision to build. The hub authenticates the sender and validates the source against [`spokes.yml`](spokes.yml). For a pull request, it deploys that revision as a temporary preview and reports the result back to the product pull request. For merged content, it publishes the product site.

During a build, the hub fetches the configured content, applies the shared Docusaurus configuration, and deploys the generated product site.

Start with:

- [`spokes.yml`](spokes.yml) to see which product repositories are connected;
- [`docusaurus.config.ts`](docusaurus.config.ts) to see how their content is assembled;
- [`.github/workflows`](.github/workflows) to see how builds and deployments are coordinated;
- [`CONTRIBUTING.md`](CONTRIBUTING.md) to add or work on product documentation.

## Local development

Requirements: Node.js 22, Git, and Git LFS when a product repository uses LFS.

```sh
npm install

# Build all registered product sites
BUILD_ALL_SPOKES=1 BASE_URL=/ SITE_URL=https://docs.example.com npm run build

# Or build one product site
SPOKE=openvino SITE_URL=https://docs.example.com npm run build

npm run serve
```
