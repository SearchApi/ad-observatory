// Dynamic catalog tokens are source metadata, not resolved advertising copy.
// Keep the original record intact for grouping and JSON exports.
export function creativeText(ad) {
 const title = typeof ad.title === 'string' ? ad.title : '';
 const body = typeof ad.body === 'string' ? ad.body : '';
 const dynamic = value => /\{\{[\s\S]*?\}\}/u.test(value);
 return {
  title: dynamic(title) ? '' : title,
  body: dynamic(body) ? '' : body,
  dynamicTitle: dynamic(title),
  dynamicBody: dynamic(body)
 };
}
export function creativeCopyExport(ad) {
 const text = creativeText(ad);
 return [text.title, text.body, text.dynamicTitle || text.dynamicBody ? 'Some text uses dynamic product fields. The resolved text was not supplied by the source.' : ''].filter(Boolean).join('\n\n');
}
