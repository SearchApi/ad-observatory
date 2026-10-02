# Contributing

Ad Observatory is a local example application for researching public Meta ads with SearchApi. Keep changes focused on reproducible research workflows and document what the application adds to provider data.

## Local development

1. Use Node.js 24.13.0 or newer (Node 24 is the tested runtime). With nvm, run `nvm install` and `nvm use`.
2. Run `npm start` and open the local URL printed by the server.
3. Run `npm test` and `npm run build` before proposing code changes. Commit `public/api-guide.html` when changes to the API guide regenerate it.

There are no npm dependencies to install. Automated tests use synthetic fixtures and do not call SearchApi. Live searches require your own API key and consume your allowance; describe live verification separately from automated tests.

## Bug reports and feature requests

Use the repository issue templates. Include steps to reproduce, expected and actual behavior, and your Node/browser versions. For search problems, describe the search mode, country and status filters without sharing credentials or private research.

Never attach API keys, agent tokens, cookies, `.data/` databases or unredacted network logs. For a suspected security issue, contact a SearchApi repository maintainer privately before posting sensitive details in an issue.

## Pull requests

Create a focused branch and explain the problem, resulting behavior and verification. Update relevant documentation when setup or behavior changes. Keep fixtures explicitly synthetic; do not commit user captures, local databases or credentials. Preserve loopback-only hosting, workspace isolation and the distinction between retrieved ad data and application observations.

Documentation-only changes need a link and consistency review; code changes should pass the existing checks. Do not describe sample coverage, ad longevity or missing results as evidence of campaign performance or deactivation.

## Release and licensing

The repository remains private. See [RELEASE.md](RELEASE.md) for public-release requirements. No license has been selected; contributions do not change that status.
