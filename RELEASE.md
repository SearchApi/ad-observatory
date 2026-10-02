# Release checklist

The standalone application was merged into `main` through [PR #1](https://github.com/SearchApi/ad-observatory/pull/1) on September 29, 2026. The repository remains private.

Before making this repository public:

- [ ] SearchApi approves and adds the license.
- [ ] A teammate reviews the extraction, request handlers and credential flow.
- [ ] Required checks and branch protection are configured for the default branch.
- [ ] Confirm a limited real Shopify and BigCommerce search with a valid user key, media playback/download, and the video walkthrough.
- [ ] Confirm the final README commands from a clean clone of the approved branch.
- [ ] Update the video script with the final repository URL and commands.
- [ ] Explicitly approve changing repository visibility to public.

Automated tests use synthetic fixtures. Passing them does not establish that current provider results, media URLs or account credentials are available.

## Current validation

The standalone branch passed 53 automated tests and guide generation on Node 24.13.0 from a clean local clone. An HTTP smoke test confirmed empty startup, automatic migrations, collection persistence across a server restart, agent token reads/revocation, and protection of private files and local Host headers. Browser verification confirmed the empty gallery and collapsed Saved competitors.

The existing private SearchApi credential was rejected with HTTP 401. Real Shopify/BigCommerce searches and current media playback/download remain unverified. No private credential or captured user data is included in this repository.

## Repository About settings

A repository administrator should apply these settings. The connected contributor account has push access but cannot edit repository settings.

- **Description:** Research public Meta ads with SearchApi. Compare creatives, save competitors, and organize ad references in a local app.
- **Website:** https://www.searchapi.io/docs/meta-ad-library-api
- **Topics:** `searchapi`, `meta-ads`, `ad-library`, `competitor-research`, `ad-creatives`, `javascript`, `nodejs`, `sqlite`

The website field points to the provider documentation, not a hosted version of this local application.
