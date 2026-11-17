# Ad Observatory

Research public Meta ads with [SearchApi](https://www.searchapi.io/docs/meta-ad-library-api), compare creative approaches, and save references for your next campaign.

This is a local example application for developers and technical marketers. It is not a hosted service or a production-ready multi-user deployment.

## Video walkthrough

[![How to Scrape Meta Ads Library for Competitor Research](https://img.youtube.com/vi/R-1rU22SbJo/maxresdefault.jpg)](https://www.youtube.com/watch?v=R-1rU22SbJo)

Watch the full walkthrough on YouTube: [How to Scrape Meta Ads Library for Competitor Research](https://www.youtube.com/watch?v=R-1rU22SbJo).

## Run locally

You need Git and **Node.js 24.13.0 or newer**. Node 24 is the tested runtime; the app uses Node's built-in SQLite support. No npm packages, cloud account, or separate database installation are required.

```sh
git clone https://github.com/SearchApi/ad-observatory.git
cd ad-observatory
npm start
```

Open **http://127.0.0.1:5190**. The first visit starts empty and does not search for ads. Stop the server with Ctrl+C.

If you use nvm, run `nvm install` and `nvm use` first. A SQLite experimental warning from Node is expected.

If port 5190 is already in use, stop the other process or choose a port:

```sh
# macOS / Linux
PORT=5192 npm start
```

```powershell
# Windows PowerShell
$env:PORT=5192
npm start
```

Use the exact `127.0.0.1` URL printed by the server. Keep the same browser and URL when returning to saved research.

## Your first research session

1. Create a [SearchApi account](https://www.searchapi.io/users/sign_up) and obtain your API key.
2. Open **Connections**, connect your key, and close the dialog. Keep the key out of screenshots and recordings.
3. Paste an advertiser's Facebook Page or Instagram profile URL, select an audience country and ad status, then choose **Add competitor**. Alternatively, select **Keyword** to search the library.
4. Add a second advertiser. For example, Shopify and BigCommerce are relevant references for someone marketing an ecommerce platform. Verify the advertiser identity and choose ads relevant to your brief; results change over time.
5. Filter by format, inspect the copy and destination, and save individual ads to a collection such as **Ecommerce platform - creative research**.
6. Reopen the collection in **My collections**. **Saved competitors** stores advertiser shortcuts separately from your captures.

Searches use your SearchApi allowance and retrieve at most two result pages. An advertiser lookup may add a request. Reopening retained captures does not run another provider search. There is no automatic refresh or scheduled monitoring.

## SearchApi cost and billing

SearchApi [bills per successful request](https://www.searchapi.io/pricing); failed requests are not billed. One competitor check can require up to **three searches**:

- Up to 2 `meta_ad_library` requests (one per result page when pagination is available)
- 1 `meta_ad_library_page_search` request when you paste an Instagram profile or Facebook Page alias that needs to be resolved to a numeric advertiser ID

**Example cost:** At the entry rate of $4 per 1,000 searches, one competitor check costs approximately $0.012. Tracking 5 brands weekly uses roughly 60 searches per month, or about $0.25/month. Higher-tier plans reduce the per-search cost. See the [SearchApi pricing page](https://www.searchapi.io/pricing) for current rates; prices may change.

Reopening retained captures does not call SearchApi and incurs no additional cost.

## What the app adds

SearchApi retrieves structured public ad records: available text, media URLs, advertiser information, source dates and placements. Ad Observatory adds a gallery, creative grouping, filters, saved competitors, dated captures, collections, exports and individual asset downloads. Optional destination checks inspect a small number of advertised URLs; they are not SearchApi search results.

**Snapshot comparison** lets you pick two dated captures for the same advertiser and see:
- **New ad IDs** in the later capture (not present in the baseline)
- **Retained ad IDs** seen in both captures
- **Missing ad IDs** present in the baseline but absent from the later capture
- **Edited copy** indicators when the same ad ID has different text between captures

Ads are matched by their stable ad archive ID from the SearchApi record. Comparisons work from stored captures only and do not trigger new SearchApi calls. Treat missing ads as possibly stopped, not confirmed: each search is a bounded sample (maximum 2 result pages), so absence does not prove an ad stopped running.

A long-running ad is a research clue, not proof of conversions, profitability, spend, targeting, or continuous delivery. Absence from a later bounded sample does not prove that an ad stopped. Media remains hosted by its source and can expire; a saved collection is not a permanent video archive.

## Keys and local data

The key lives in the current tab's memory and is sent to your local backend, which calls SearchApi. The application does not persist the key; reconnect after reloading. Do not commit keys or put them in the URL. No deployment owner's key is bundled or used as a fallback.

The server listens only on `127.0.0.1`. Data is created automatically in `.data/ad-observatory.sqlite`, which is ignored by Git. A browser cookie identifies your workspace; browser storage also retains captures. Collections and saved competitors survive server restarts. Clearing cookies loses access to that workspace; clearing browser storage removes browser-held captures. This example has no login or account recovery.

Do not expose this server with a public tunnel or treat it as a production deployment. Hosting for other users requires an appropriate authentication, authorization, credential-storage and operational design.

## Optional agent API

**Connections → Agent API guide** explains the REST endpoints and temporary workspace tokens. This is REST/OpenAPI, not an MCP server. Reading saved research does not call SearchApi; agent searches require the agent token and the caller's SearchApi key. Tokens can be revoked and expire after 30 days.

- [API guide](public/API.md)
- [OpenAPI specification](public/openapi.json)

## Development and verification

```sh
npm test
npm run build
```

Tests use synthetic examples and isolated databases; they do not spend SearchApi credits. `build` regenerates the HTML API guide and does not deploy anything. GitHub Actions runs syntax checks, tests, and guide generation on Node 24.13.0.

- `public/`: browser interface and API documentation
- `server/`: request handlers, search normalization and persistence
- `scripts/start.mjs`: local HTTP server
- `scripts/sqlite-store.mjs`: local SQLite adapter
- `drizzle/`: automatically applied database migrations
- `tests/`: functional and security regression tests

## Troubleshooting

- **Connect your key / 401:** reconnect a valid SearchApi key in Connections.
- **No results:** verify the advertiser and try an appropriate country/status. An empty result is not proof of no advertising anywhere.
- **Expired media:** refresh the advertiser or use available copy and metadata; old CDN links may stop working.
- **Rate limit:** wait before retrying. Search caching and local request limits bound usage; they are not a substitute for monitoring your SearchApi account.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local checks, bug reports and pull requests. Never include API keys, workspace tokens or private research data in issues or screenshots.

## Project status and licensing

Ad Observatory is open source under the [MIT License](LICENSE). See [RELEASE.md](RELEASE.md) for the release checklist.
