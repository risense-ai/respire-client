import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMemories} from '../src/data.js';
import {ROOT_ID,initialTree,pathFor,subtreeIds,memoriesInScope,canMove,moveNode} from '../src/treeModel.js';
import {scopeDigest,captureScope,enrichGrants,grantsForNode,moveImpact} from '../src/treeAccess.js';

const nodes=initialTree(initialMemories);
const grants=[{id:'claude',tool:'Claude',scopeId:'tree-product',permission:'read',enabled:true},{id:'codex',tool:'Codex',scopeId:'mem-04',permission:'write',enabled:true},{id:'chatgpt',tool:'ChatGPT',scopeId:'mem-06',permission:'read',enabled:true}];
test('a nested scope includes descendants, never siblings or ancestors',()=>{
 assert.deepEqual(memoriesInScope(nodes,initialMemories,'mem-05').map(m=>m.id),['mem-05','mem-06']);
 assert.deepEqual(pathFor(nodes,'mem-06').map(n=>n.id),[ROOT_ID,'tree-coding','mem-04','mem-05','mem-06']);
 assert.equal(memoriesInScope(nodes,initialMemories,ROOT_ID).length,16);
});
test('moves cannot create cycles or move the root',()=>{
 assert.equal(canMove(nodes,'mem-04','mem-06'),false);
 assert.equal(canMove(nodes,ROOT_ID,'mem-01'),false);
 assert.equal(canMove(nodes,'mem-05','mem-05'),false);
 assert.equal(canMove(nodes,'missing',ROOT_ID),false);
});
test('cross-boundary moves recompute inherited permissions and retain direct grants',()=>{
 assert.deepEqual(grantsForNode(grants,nodes,'mem-06').map(g=>g.id),['codex','chatgpt']);
 const moved=moveNode(nodes,'mem-05','tree-product');
 assert.deepEqual(grantsForNode(grants,moved,'mem-06').map(g=>g.id),['claude','chatgpt']);
 assert.equal(pathFor(nodes,'mem-06')[1].id,'tree-coding');
 assert.deepEqual(subtreeIds(moved,'mem-05'),['mem-05','mem-06']);
 const changes=moveImpact(nodes,moved,grants,'mem-05');
 assert.deepEqual(changes.map(c=>[c.grant.id,c.added.length,c.removed.length]),[['claude',2,0],['codex',0,2]]);
});
test('renaming preserves identity and grants while marking the payload pending',()=>{
 const installed=captureScope(grants[1],nodes,initialMemories);
 const renamed=nodes.map(n=>n.id==='mem-04'?{...n,title:'新项目名称'}:n);
 assert.equal(grantsForNode(grants,renamed,'mem-06').length,2);
 assert.equal(enrichGrants([installed],renamed,initialMemories)[0].pending,true);
});
test('type-only changes sync, unrelated changes do not, and refresh captures a new revision',()=>{
 const installed=captureScope(grants[1],nodes,initialMemories);
 const changed=initialMemories.map(m=>m.id==='mem-06'?{...m,type:'decision'}:m);
 assert.notEqual(scopeDigest(nodes,initialMemories,'mem-04'),scopeDigest(nodes,changed,'mem-04'));
 const unrelated=initialMemories.map(m=>m.id==='mem-01'?{...m,content:'other'}:m);
 assert.equal(enrichGrants([installed],nodes,unrelated)[0].pending,false);
 assert.equal(enrichGrants([installed],nodes,changed)[0].pending,true);
 const refreshed=captureScope(installed,nodes,changed);
 assert.equal(refreshed.revision,installed.revision+1);
 assert.equal(enrichGrants([refreshed],nodes,changed)[0].pending,false);
});
test('revoking one grant preserves independent inheritance and deleted scopes stop distributing',()=>{
 assert.deepEqual(grantsForNode(grants.filter(g=>g.id!=='chatgpt'),nodes,'mem-06').map(g=>g.id),['codex']);
 const deleted=nodes.filter(n=>!subtreeIds(nodes,'mem-04').includes(n.id));
 assert.deepEqual(enrichGrants(grants,deleted,initialMemories).map(g=>g.id),['claude']);
});
