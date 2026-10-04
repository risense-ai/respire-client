import {subtreeIds,memoriesInScope,pathFor} from './treeModel.js';

export const scopePath=(nodes,id)=>pathFor(nodes,id).map(n=>n.title).join(' / ');
export function scopeDigest(nodes,memories,id){
 const ids=new Set(subtreeIds(nodes,id));
 return JSON.stringify({nodes:nodes.filter(n=>ids.has(n.id)).map(n=>({id:n.id,parentId:n.id===id?null:n.parentId,title:n.title,kind:n.kind})).sort((a,b)=>a.id.localeCompare(b.id)),memories:memoriesInScope(nodes,memories,id).map(m=>({id:m.id,title:m.title,content:m.content,type:m.type,source:m.source,tags:m.tags})).sort((a,b)=>a.id.localeCompare(b.id))});
}
export function captureScope(grant,nodes,memories){
 return {...grant,appliedDigest:scopeDigest(nodes,memories,grant.scopeId),appliedIds:memoriesInScope(nodes,memories,grant.scopeId).map(m=>m.id),lastSyncAt:new Date().toISOString(),revision:(grant.revision||0)+1};
}
export function enrichGrants(grants,nodes,memories,syncing=[]){
 return grants.filter(g=>nodes.some(n=>n.id===g.scopeId)&&g.enabled!==false).map(g=>({...g,path:scopePath(nodes,g.scopeId),currentCount:memoriesInScope(nodes,memories,g.scopeId).length,pending:g.appliedDigest!==scopeDigest(nodes,memories,g.scopeId),status:syncing.includes(g.id)?'syncing':undefined}));
}
export const grantsForNode=(grants,nodes,id)=>grants.filter(g=>g.enabled!==false&&subtreeIds(nodes,g.scopeId).includes(id));
export function moveImpact(nodes,after,grants,id){
 const ids=new Set(subtreeIds(nodes,id));
 return grants.filter(g=>g.enabled!==false).map(g=>{const before=new Set(subtreeIds(nodes,g.scopeId));const next=new Set(subtreeIds(after,g.scopeId));return {grant:g,added:[...ids].filter(x=>next.has(x)&&!before.has(x)),removed:[...ids].filter(x=>before.has(x)&&!next.has(x))}}).filter(x=>x.added.length||x.removed.length);
}
