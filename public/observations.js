// A missing result is an observation, never evidence of deactivation.
export function collectionObservation(ad,captures){
 const ordered=[...captures].filter(s=>Number.isFinite(Date.parse(s.capturedAt))).sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt));
 const origin=ordered.find(s=>s.capturedAt===ad.capturedAt&&s.ads.some(a=>a.id===ad.id&&a.pageId===ad.pageId));
 const scope=ad.observationScope||origin?.scopeKey;
 const latest=ordered.find(s=>Date.parse(s.capturedAt)>Date.parse(ad.capturedAt)&&(s.ads.some(a=>a.id===ad.id&&a.pageId===ad.pageId)||(scope&&s.scopeKey===scope)));
 if(!latest)return {state:'saved',label:'Saved observation',checkedAt:ad.capturedAt,detail:'No newer matching observation. The saved reference is kept.'};
 const seen=latest.ads.find(a=>a.id===ad.id&&a.pageId===ad.pageId);
 if(seen)return {state:seen.isActive===false?'inactive':seen.isActive===true?'active':'unknown',label:seen.isActive===false?'Inactive at latest observation':seen.isActive===true?'Active at latest observation':'Seen again · status unknown',checkedAt:latest.capturedAt,detail:'Source status from a newer capture. Your original saved copy is unchanged.'};
 return {state:'missing',label:'Not seen in latest matching capture',checkedAt:latest.capturedAt,detail:(latest.status==='partial'?'That capture was incomplete. ':'')+'Absence from this sample does not prove the ad stopped. Your saved reference is kept.'};
}
