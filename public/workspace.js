// Keep real captures separate. The combined gallery is a view, not a new observation.
export function competitorSnapshots(snapshots, excluded = []) {
 const latest = new Map();
 for (const snapshot of snapshots) {
  const id = snapshot.config?.watchlist?.[0]?.pageId;
  if (!snapshot.pageUrl || !id || snapshot.config.watchlist.length !== 1) continue;
  const previous = latest.get(id);
  if (!previous || Date.parse(snapshot.capturedAt) >= Date.parse(previous.capturedAt)) latest.set(id, snapshot);
 }
 return [...latest.values()].filter(s => !excluded.includes(s.config.watchlist[0].pageId));
}
export function workspaceAds(snapshots) {
 const ads = new Map();
 for (const snapshot of snapshots) for (const ad of snapshot.ads) ads.set(JSON.stringify([ad.pageId, ad.id]), ad);
 return [...ads.values()];
}
export function retainCaptures(snapshots, historyLimit = 24) {
 const live = snapshots.filter(s => s.pageUrl || s.config?.query);
 const keep = new Set([...competitorSnapshots(live), ...live.slice(-historyLimit)].map(s => s.id));
 return live.filter(s => keep.has(s.id));
}
