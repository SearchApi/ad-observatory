# Ad Observatory agent API

Use your saved competitor research from an AI agent or a script. This is the Ad Observatory REST API, not a SearchApi endpoint or an MCP server.

## Connect

1. Open Ad Observatory → **Connections** in the browser containing your collections.
2. Connect your own SearchApi key to search in the app. The key stays in memory in that tab; reloading requires reconnecting. Browsing existing captures does not need the key.
3. Choose **Sync saved captures** to include older captures stored only in your browser. New searches are saved on the server automatically.
4. Choose **Create agent token**. Copy it immediately into your agent's private environment/configuration. The token expires in 30 days. Replacing or revoking it disables the old token immediately.
5. Configure your agent from `openapi.json` beside this guide. Send `Authorization: Bearer <agent-token>` on every agent request. Only searches additionally require `X-SearchApi-Key: <your-searchapi-key>`.

The agent token authorizes access to this browser workspace: read captures and collections, compare captures, create collections, save captured ads, and search with an independently supplied SearchApi key. It cannot mint/revoke tokens or retrieve your SearchApi key. There is no login or recovery: clearing the browser's workspace cookie loses access. Other devices have separate workspaces. Collections are copied records, not live views of a capture.

Do not put credentials in URLs, prompts, source code, or public logs. This app sends the SearchApi key to SearchApi only, through its server, and does not persist it. It stores a hash of the agent token. Provider media URLs are temporary and can expire.

## Examples

Set `AD_OBSERVATORY_URL` to the site's origin, `AD_OBSERVATORY_TOKEN` to your token, and `SEARCHAPI_API_KEY` to your own SearchApi key using your private environment or secret manager. For local development the origin is `http://127.0.0.1:5190`.

List ads from the latest saved capture for each advertiser:

```sh
curl "$AD_OBSERVATORY_URL/api/v1/ads?limit=50" \
  -H "Authorization: Bearer $AD_OBSERVATORY_TOKEN"
```

Search active ads on all Meta placements (uses SearchApi credits):

```sh
curl "$AD_OBSERVATORY_URL/api/v1/search" \
  -H "Authorization: Bearer $AD_OBSERVATORY_TOKEN" \
  -H "X-SearchApi-Key: $SEARCHAPI_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://www.instagram.com/shopify/","country":"ALL"}'
```

If an exact Instagram handle maps to several advertiser pages, the response contains `candidates` instead of `snapshot`. Choose a returned `pageId` and repeat the same request with that field. Never select a similarly named page as a substitute.

Create a collection, then use its returned `id` and an ad from one of your saved captures:

```sh
curl "$AD_OBSERVATORY_URL/api/v1/collections" \
  -H "Authorization: Bearer $AD_OBSERVATORY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Next campaign"}'

curl "$AD_OBSERVATORY_URL/api/v1/collections/COLLECTION_ID/items" \
  -H "Authorization: Bearer $AD_OBSERVATORY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"captureId":"CAPTURE_ID","adId":"AD_ID"}'
```

## Endpoints

- `GET /api/v1/captures`: paginated capture summaries, newest first; includes advertiser, count, scope, coverage, and provenance.
- `GET /api/v1/captures/{id}`: full saved capture including ads and coverage, accessible only to its owner.
- `GET /api/v1/ads`: paginated ads. Optional `capture` selects one saved capture; otherwise uses the latest capture per advertiser. Filters: `q` (copy, advertiser, ID or CTA), `pageId`, `format` (`image`, `video`, `text`), `platform` (lowercase provider name such as `instagram`). Sort: newest source start date first. Browser-hidden competitors are still included; hiding is a browser presentation preference.
- `GET /api/v1/compare?before={id}&after={id}`: same-scope saved-observation comparison. Returns `available`, `added`, `retained`, `missing`, and `bounded`, or `available:false` with a reason. Missing from a bounded sample does not prove an ad stopped. Both captures must exist in your workspace, be successful, have the same scope, and be chronologically ordered.
- `POST /api/v1/search`: JSON `url`, optional `country` (default `ALL`) and `pageId` for an ambiguous match. All Meta placements by default. Optional legacy `adPlatform` scope is accepted for matching historical captures. Returns a saved `snapshot`, `cached`, and `cacheUntil`, or advertiser `candidates`.
- `GET /api/v1/collections`: all your collection summaries (up to 50).
- `POST /api/v1/collections`: JSON `name` (1–80 characters); returns `id`.
- `GET /api/v1/collections/{id}`: name and saved `items` with `ad` and `savedAt` (up to 200).
- `POST /api/v1/collections/{id}/items`: JSON `captureId` and `adId`. Saves an independent copy from a capture you own; duplicate ad IDs are updated. Returns `ok:true`.

Paginated responses use `items`, `total`, `offset`, `limit`, `nextOffset`. Default limit 50, maximum 200. Pass `offset=nextOffset` until it is null. The collection endpoints return their complete bounded contents.

## Added data and interpretation

`GET /ads` includes `derived` per ad:

- `runningDays`: whole elapsed days from source start date to that ad's saved capture, only when active with valid dates; otherwise null. Zero means less than one day.
- `assetCount`: number of returned creative assets.
- `firstObserved`, `lastObserved`: earliest/latest retained capture timestamps containing that advertiser + ad ID.
- `observationCount`: number of distinct retained observation timestamps containing it.

These fields are calculated by the application. Ad copy, media, platforms, source dates and activity come from SearchApi's Meta Ad Library response. No impressions, spend, conversions, ROAS, profitability or uninterrupted delivery are inferred. Imported captures are labeled `provenance: "browser-import"`; provider searches are labeled `"search"`. Imports are user-supplied records, not independently verified fresh searches.

## Limits and errors

The server retains the latest 100 captures per browser workspace. The browser retains the last 24 plus the latest per advertiser, subject to browser storage; this can make local observation totals differ from the API until older captures are synced. Collections keep independent copies. There is no scheduled monitoring.

Searches collect at most two result pages. Exact searches and provider results are cached for one hour per workspace/key; partial captures are cached for 60 seconds. Cached provider pages may still be reused on a partial retry. A source search can require multiple SearchApi requests for page matching and pagination. The app allows 20 uncached searches per workspace/hour and 100 provider requests per key/day by default (deployment configurable up to 200). Agent endpoints allow 120 requests per workspace/minute. These limits are separate from your SearchApi plan's credits and rate limits. Saved-data reads do not call SearchApi.

Errors return JSON `error`: 400 invalid parameters, 401 missing/expired/rejected credentials, 403 origin restriction on browser actions, 404 resource absent or not yours, 405 wrong method, 409 collection limit or search already in progress, 413 oversized payload, 415 unsupported content type, 429 allowance/credit/rate limit, and 5xx service failure. Retry reads later on 429/5xx. Do not blindly retry collection creation after an uncertain response; list collections first.

## Keyword searches and saved collection observations

`POST /api/v1/search` also accepts `query` instead of `url`, for example:

```json
{"query":"curso de inglês","country":"BR","activeStatus":"all"}
```

Send exactly one of `url` or `query` (1–200 characters). `activeStatus` accepts `active` (default), `inactive`, or `all`. Country, status and keyword are part of the cache and comparison scope. Searches retain the existing two-page limit and use your supplied SearchApi key. Keyword captures can contain multiple advertisers or zero results. Open them by capture ID; they do not replace the latest-per-competitor gallery.

Collection responses include an `observation` alongside each saved `ad`: `state`, `label`, `checkedAt`, and `detail`. The original saved text and media references are preserved. `inactive` requires a later matching ad with explicit source status; `missing` means absent from a later capture with the same known scope, not deactivated. With no newer evidence the state is `saved`. Observation results use retained captures only. Refresh explicitly to obtain newer source data; no monitoring is scheduled.

Saved competitors and destination checks currently use browser actions, not agent routes. Destination checks visit at most ten URLs from one owned capture, cache results for one hour and do not call SearchApi. Source media is still not archived.
