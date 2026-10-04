import React,{useState,useEffect,useMemo,useRef,useDeferredValue} from 'react';
import {TreeStructure,ArrowsClockwise,ArrowClockwise,PlugsConnected,Plus,MagnifyingGlass,CaretRight,Folder,FileText,ArrowUpRight,ArrowLeft,ArrowRight,ArrowSquareOut,Link,Copy,Check,CheckCircle,Clock,ShieldCheck,LockSimple,PencilSimple,DotsThree,Trash,X,SidebarSimple,Command,Sun,Moon,DownloadSimple,UploadSimple,ArrowCounterClockwise,CloudCheck,Terminal,Info,Sparkle,BookOpen,WarningCircle,TextAa,Key,CalendarBlank,Article} from '@phosphor-icons/react';
import {initialMemories,typeInfo} from './data.js';
import {loadAppearance,saveAppearance,applyAppearance,UI_SCALES,READ_SIZE_RANGE,READ_LH_RANGE} from './appearance.js';
import {splitReadingBlocks} from './readingText.js';
import {ROOT_ID,DIARY_ID,initialTree,realTree,nodeById,pathFor,subtreeIds,memoriesInScope,canMove,moveNode,makeNodeId,isRealId} from './treeModel.js';
import {scopePath,scopeDigest,captureScope,enrichGrants,grantsForNode,moveImpact} from './treeAccess.js';
import DiaryCalendar from './DiaryCalendar.jsx';
import {boot as bridgeBoot, bootSnapshot, isNative, createMemory, updateMemory, deleteMemory, restoreMemory, attachMemory, searchMemories, readMemory, purgeMemory} from './bridge.js';
import {parseBackup} from './backup.js';
import {memoryResult} from './runtimeResult.js';
import {createMemoryRefresh, readMemorySnapshot, protectionEntered} from './memoryRefresh.js';
const inv=(cmd,args={})=>{const f=window.__TAURI__?.core?.invoke;return f?f(cmd,args).then(value=>memoryResult(cmd,value)):Promise.reject(new Error("非本地客户端（未连 Tauri）"))};
const NATIVE=isNative;
import TreeSidebar from './TreeSidebar.jsx';
import MemoryGraph from './MemoryGraph.jsx';
import {InstallView,SyncView} from './ScopeViews.jsx';
import logoDark from '../public/brand/respire-logo-dark.svg?inline';
import logoLight from '../public/brand/respire-logo-reverse.svg?inline';

const read=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key));return value??fallback}catch{return fallback}};
const validMemories=value=>Array.isArray(value)&&value.every(m=>m&&typeof m.id==='string'&&typeof m.title==='string'&&typeof m.content==='string');
const loadMemories=()=>{const value=read('respire-demo-memories-v2',initialMemories);return validMemories(value)?value:initialMemories};
const timeLabel=value=>new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const tools=[{name:'Claude',destination:'Claude Desktop · 个人工作区',mark:'✳'},{name:'ChatGPT',destination:'ChatGPT · 项目上下文',mark:'◎'},{name:'Codex',destination:'Codex · 本机工作区',mark:'>_'},{name:'Cursor',destination:'Cursor · 当前项目',mark:'↗'},{name:'其他 App',destination:'自定义 App · 上下文接口',mark:'⌘'}];
const IconButton=({label,children,...props})=><button className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
function Modal({title,onClose,children,wide=false}){
 const ref=useRef();
 const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const previous=document.activeElement;(ref.current?.querySelector('input:not([disabled]),textarea:not([disabled]),select:not([disabled])')||ref.current?.querySelector('button'))?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();closeRef.current()}if(e.key==='Tab'){const items=Array.from(ref.current?.querySelectorAll('input:not([disabled]),button:not([disabled]),textarea,select,[tabindex="0"]')||[]);if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()}},[]);
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section ref={ref} className={'modal tw-modal '+(wide?'wide':'')} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><IconButton label="关闭" onClick={onClose}><X size={19}/></IconButton></header>{children}</section></div>;
}
function NativeMemorySearch({onClose,onSelect}){
 const [query,setQuery]=useState('');const [results,setResults]=useState(null);
 const [loading,setLoading]=useState(false);const [opening,setOpening]=useState(false);const [error,setError]=useState('');
 const request=useRef(0);
 useEffect(()=>()=>{request.current++},[]);
 const search=async e=>{
  e.preventDefault();const q=query.trim();if(!q)return;
  const id=++request.current;setLoading(true);setResults(null);setError('');
  try{const found=await searchMemories(q);if(id===request.current)setResults(found)}
  catch(e){if(id===request.current)setError('搜索失败：'+(e.message||String(e)))}
  finally{if(id===request.current)setLoading(false)}
 };
 const open=async id=>{
  const current=request.current;setOpening(true);setError('');
  try{if(await onSelect(id,message=>{if(current===request.current)setError('读取失败：'+message)})&&current===request.current)onClose()}
  finally{if(current===request.current)setOpening(false)}
 };
 return <Modal title="搜索记忆" onClose={onClose} wide>
  <form className="search-modal-input" onSubmit={search}><MagnifyingGlass size={20}/><input autoFocus aria-label="搜索记忆" value={query} disabled={opening} onChange={e=>{request.current++;setQuery(e.target.value);setResults(null);setError('');setLoading(false)}} placeholder="输入关键词或描述，按 Enter 搜索…"/><button className="button" type="submit" disabled={loading||opening||!query.trim()}>搜索</button></form>
  <div className="search-results" aria-busy={loading||opening}>
   {loading&&<p role="status">正在搜索…</p>}
   {opening&&<p role="status">正在读取记忆…</p>}
   {error&&<p role="alert">{error}</p>}
   {results?.map(m=><button key={m.id} disabled={opening} onClick={()=>open(m.id)}><FileText size={18}/><div><strong>{m.title}</strong><p>{m.summary}</p></div><ArrowUpRight size={14}/></button>)}
   {results?.length===0&&<div className="tw-empty"><p>没有找到相关记忆</p><small>试试其他关键词或描述。</small></div>}
   {!loading&&!error&&results===null&&<div className="tw-empty"><p>输入关键词或描述，搜索本机记忆库。</p></div>}
  </div>
 </Modal>;
}
function Editor({node,memory,parentPath,onClose,onSave,saving=false,error=''}){
 const [title,setTitle]=useState(node?.title||'');const [content,setContent]=useState(memory?.content||'');const [kind]=useState(node?.kind||'memory');const [type,setType]=useState(memory?.type||'context');
 // Importance matches the CLI: important belongs to the main tree; trivial belongs to the daily diary.
 // Default new tree memories to important instead of the CLI's trivial default.
 const [importance,setImportance]=useState(memory?.importance==='trivial'?'trivial':'important');
 // Use an immediate ref guard because React state updates alone cannot block duplicate submissions in the same batch.
 const busyRef=useRef(false);
 useEffect(()=>{if(!saving)busyRef.current=false},[saving]);
 const submit=e=>{e.preventDefault();if(busyRef.current||saving)return;if(title.trim()){busyRef.current=true;onSave({title:title.trim(),content:content.trim(),kind,type,importance})}};
 return <Modal title={node?.id?'编辑节点':kind==='tree'?'新建子树':'新建记忆'} onClose={()=>{if(!saving)onClose()}} wide><form onSubmit={submit}><p className="tw-form-path"><Folder size={14}/>{parentPath}</p><label>名称<input required autoFocus value={title} maxLength={100} placeholder={kind==='tree'?'例如：Respire 产品研究':'这段记忆的名称'} onChange={e=>setTitle(e.target.value)} disabled={saving}/></label>{kind==='memory'&&<><label>类型<select value={type} onChange={e=>setType(e.target.value)} disabled={saving}>{Object.entries(typeInfo).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label><label>重要性<select value={importance} onChange={e=>setImportance(e.target.value)} disabled={saving}><option value="important">重要 · 正式记忆</option><option value="trivial">琐事 · 并入当日轨迹</option></select></label><label>内容<textarea value={content} required rows={8} placeholder="背景、偏好、约束、决定……" onChange={e=>setContent(e.target.value)} disabled={saving}/></label></>}{error&&<p className="muted">{error}</p>}<div className="tw-form-footnote"><Info size={14}/>保存后，按所在子树的安装与同步规则分发。</div><footer className="modal-footer"><button className="button" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button primary" type="submit" disabled={saving||!title.trim()||(kind==='memory'&&!content.trim())}><Check size={15}/>{saving?'保存中…':'保存'}</button></footer></form></Modal>;
}
// Fall back to execCommand when clipboard access is denied by the Tauri webview.
const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false }
};
function InstallDialog({scopeId,existing,nodes,memories,onClose,onSave,bridged,notify}){
 const inv2=(c,a={})=>{const f=window.__TAURI__?.core?.invoke;return f?f(c,a):Promise.reject(new Error("非本地客户端（未连 Tauri）"))};
 const [tool,setTool]=useState(existing?.tool||'Claude');const [destination,setDestination]=useState(existing?.destination||tools[0].destination);const [permission,setPermission]=useState(existing?.permission||'read');const [syncMode,setSyncMode]=useState(existing?.syncMode||'auto');const [preview,setPreview]=useState(false);const [copied,setCopied]=useState(false);
 const scope=memoriesInScope(nodes,memories,scopeId);const root=nodeById(nodes,scopeId);
 // Resolve virtual nodes to the nearest real memory ancestor; all-virtual paths disable CLI actions.
 const isRealId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(v);
 const realScopeId=(()=>{if(isRealId(scopeId))return scopeId;let cur=nodeById(nodes,scopeId);const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);if(isRealId(cur.id))return cur.id;cur=nodeById(nodes,cur.parentId)}return null})();
 const demoMaterial=['# respire · '+root?.title,'','Scope: '+scopePath(nodes,scopeId),'Node: '+scopeId,'Access: '+(permission==='read'?'read-only':'read-write'),'Sync: '+(syncMode==='auto'?'continuous':'manual'),'','以下记忆仅属于所选作用域；不包含其他子树。','',...scope.flatMap(m=>['## '+scopePath(nodes,m.id),'',m.content,''])].join('\n');
 const isRoot=scopeId===ROOT_ID;
 const [cliMaterial,setCliMaterial]=useState(null);
 useEffect(()=>{if(bridged&&!isRoot){if(!realScopeId){setCliMaterial(null);return}inv2('scope_material',{root:realScopeId}).then(r=>setCliMaterial(r&&r.material||'（子树为空——材料随成员变化）')).catch(e=>setCliMaterial('材料获取失败：'+e))}},[bridged,scopeId,realScopeId]);
 const material=bridged?(isRoot?demoMaterial:(cliMaterial??(realScopeId?'（加载中…）':'虚拟分组无真库记忆，请选具体节点。'))):demoMaterial;
 const exportInstall=()=>{const url=URL.createObjectURL(new Blob([material],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='respire-scope-'+String(scopeId).slice(0,8)+'-context.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

 return <Modal title={bridged?'安装此子树 · 本机作用域与材料':'Install · 将子树带到 AI'} onClose={onClose} wide><div className="tw-install-scope"><span><TreeStructure size={19}/><strong>{root?.title}</strong><small>包含全部后代</small></span><code>{scopePath(nodes,scopeId)}</code><button onClick={()=>setPreview(!preview)}>{scope.length} 条记忆 · 预览作用域<CaretRight size={13} style={{transform:preview?'rotate(90deg)':undefined}}/></button>{preview&&<div className="tw-scope-preview">{scope.map(m=><div key={m.id}><FileText size={13}/><span>{scopePath(nodes,m.id)}</span></div>)}{!scope.length&&<p>当前子树为空；以后新增的记忆会纳入此范围。</p>}</div>}</div>
 {bridged?<>
   <div style={{display:'flex',gap:8,margin:'10px 0',flexWrap:'wrap'}}>
     <button className="button" type="button" disabled={!realScopeId} onClick={async()=>{try{await copyText(material);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{notify&&notify('复制失败')}}}><Copy size={13}/>{copied?'已复制':'复制子树材料'}</button>
     <button className="button" type="button" disabled={!realScopeId} onClick={exportInstall}><DownloadSimple size={13}/>下载材料</button>
   </div>
   <textarea aria-label="子树材料预览" readOnly rows={10} style={{width:'100%'}} value={material}/>
   <footer className="modal-footer"><button className="button" type="button" onClick={onClose}>关闭</button></footer>
 </>:<form onSubmit={e=>{e.preventDefault();onSave({id:existing?.id,tool,destination:destination.trim(),permission,syncMode,scopeId})}}>
   <div className="form-row"><label>安装到<select value={tool} onChange={e=>{setTool(e.target.value);setDestination(tools.find(t=>t.name===e.target.value).destination)}}>{tools.map(t=><option key={t.name}>{t.name}</option>)}</select></label><label>访问权限<select value={permission} onChange={e=>setPermission(e.target.value)}><option value="read">只读 · 读取上下文</option><option value="write">读写 · 允许修改记忆</option></select></label></div><label>目标工作区<input required value={destination} onChange={e=>setDestination(e.target.value)} maxLength={120}/></label><div className="tw-install-sync"><div><strong>持续同步</strong><span>{syncMode==='auto'?'后续修改和新增后代自动同步到此目标':'修改先保留在本机，手动更新目标'}</span></div><button className={'tw-switch '+(syncMode==='auto'?'on':'')} type="button" role="switch" aria-checked={syncMode==='auto'} aria-label="持续同步到安装目标" onClick={()=>setSyncMode(syncMode==='auto'?'manual':'auto')}><i/></button></div><div className="tw-permission-notice"><ShieldCheck size={16}/><p>{permission==='read'?'只读所选子树，不含兄弟与祖先。':'可读可写所选子树；移动会改权限。'}</p></div><details className="tw-install-material"><summary>注入内容与安装材料 <span>Markdown · 可复制</span></summary><textarea aria-label="注入内容预览" readOnly rows={7} value={material}/><div><button type="button" onClick={async()=>{try{await copyText(material);setCopied(true)}catch{setCopied(false)}}}><Copy size={13}/>{copied?'已复制':'复制注入内容'}</button><button type="button" onClick={exportInstall}><DownloadSimple size={13}/>下载材料</button></div></details><p className="tw-demo-note">本地演示：不写入外部应用。</p><footer className="modal-footer"><button className="button" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={!destination.trim()}><PlugsConnected size={16}/>{existing?'保存配置':'安装此子树'}</button></footer></form>}
 </Modal>;
}

function ShareDialog({scopeId,nodes,memories,onClose,notify}){
 const inv2=(c,a={})=>{const f=window.__TAURI__?.core?.invoke;return f?f(c,a):Promise.reject(new Error("非本地客户端（未连 Tauri）"))};
 const root=nodeById(nodes,scopeId);
 const scope=memoriesInScope(nodes,memories,scopeId);
 // Resolve grouping nodes through their nearest real memory ancestor.
 const isReal=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id);
 const realId=(()=>{let cur=nodeById(nodes,scopeId);const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);if(isReal(cur.id))return cur.id;cur=nodeById(nodes,cur.parentId)}return null})();
 const [busy,setBusy]=useState(false);
 const [prompt,setPrompt]=useState('');
 const [meta,setMeta]=useState(null);
 const [copied,setCopied]=useState(false);
 const [error,setError]=useState('');

 const build=async()=>{
  setBusy(true);setError('');
  try{
   if(!realId)throw new Error('此节点不是真库记忆（虚拟分组）——请选具体记忆或子树再分享');
   const r=await inv2('share_subtree',{root:realId});
   setPrompt(r?.prompt||'');setMeta(r||null);
   if(!r?.prompt)throw new Error('分享 prompt 为空');
  }catch(e){setError(errText(e))}
  setBusy(false);
 };
 React.useEffect(()=>{build()},[scopeId]);

 const copyPrompt=async()=>{
  if(!prompt)return;
  const ok=await copyText(prompt);
  setCopied(ok);
  notify&&notify(ok?'分享 prompt 已复制——发给对方，让他粘给自己的 AI':'复制失败，请手动全选复制');
  if(ok)setTimeout(()=>setCopied(false),1800);
 };
 const download=()=>{
  if(!prompt)return;
  const url=URL.createObjectURL(new Blob([prompt],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='respire-share-'+String(scopeId).slice(0,8)+'.txt';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };

 return <Modal title="分享此子树 · 生成导入 prompt" onClose={onClose} wide>
  <div className="tw-install-scope"><span><TreeStructure size={19}/><strong>{root?.title}</strong><small>含全部后代</small></span><code>{scopePath(nodes,scopeId)}</code></div>
  <div className="tw-permission-notice"><Info size={16}/><p>对方把整段 prompt 粘给自己的 AI，AI 会自行落盘、判挂点、导入并验收——无需他学任何命令。</p></div>
  {error&&<p role="status" style={{color:'var(--danger,#c00)'}}>{error}</p>}
  {busy&&!prompt&&<p className="muted">正在打包子树…</p>}
  {prompt&&<>
   <p className="muted">{meta?.count||scope.length} 条记忆 · prompt {prompt.length} 字符（{meta?.chars??'—'} 字正文）</p>
   <textarea aria-label="分享 prompt 预览" readOnly rows={12} style={{width:'100%'}} value={prompt}/>
   <div style={{display:'flex',gap:8,margin:'10px 0',flexWrap:'wrap'}}>
    <button className="button primary" type="button" onClick={copyPrompt}><Copy size={14}/>{copied?'已复制':'复制 prompt'}</button>
    <button className="button" type="button" onClick={download}><DownloadSimple size={14}/>下载 prompt</button>
    <button className="button" type="button" onClick={build} disabled={busy}>{busy?'重新打包中…':'重新生成'}</button>
   </div>
   <div className="tw-permission-notice"><WarningCircle size={16}/><p>载荷是明文（gzip+base64，非加密）——别把带密钥或隐私的子树往外发。</p></div>
  </>}
  <footer className="modal-footer"><button className="button" type="button" onClick={onClose}>关闭</button></footer>
 </Modal>;
}

function WorkspaceConfig({notify,onOpenGate,bridged,statusInfo,onSessionChange,section}){
 const inv2=(c,a={})=>{const f=window.__TAURI__?.core?.invoke;return f?f(c,a):Promise.reject(new Error("非本地客户端（未连 Tauri）"))};
 const [cfg,setCfg]=useState(null);
 const [dd,setDd]=useState('');
 const [addr,setAddr]=useState('');
 const [doctorInfo,setDoctorInfo]=useState(null);const [st,setSt]=useState(statusInfo||null);
 const [spaceInfo,setSpaceInfo]=useState(null);
 const [newSpace,setNewSpace]=useState('');
 const [joinCode,setJoinCode]=useState('');
 const [inviteOut,setInviteOut]=useState(null);
 const [membersOut,setMembersOut]=useState(null);
 const [inviteReadonly,setInviteReadonly]=useState(false);
 const [roMode,setRoMode]=useState(null);
 useEffect(()=>{if(statusInfo)setSt(statusInfo)},[statusInfo]);
 useEffect(()=>{(async()=>{
   try{const c=await inv2('config_get');setCfg(c);setDd(c&&c.data_dir||'');setAddr(c&&c.addr||'')}catch{}
   try{setSpaceInfo(await inv2('space_list'))}catch{}
   try{const ac=await inv2('agent_config');setRoMode(!!(ac&&ac.readonly))}catch{}
   if(!statusInfo){try{setSt(await inv2('status'))}catch{}}
 })()},[]);
 // Reload after switching spaces because the data directory, session, and database all change.
 const reloadAfterSpace=async()=>{try{if(onSessionChange)await onSessionChange()}catch{};try{window.location.reload()}catch{}};
 const spaceRow=(()=>{
   if(!bridged)return null;
   const cur=spaceInfo&&spaceInfo.spaces?spaceInfo.spaces.find(s=>s.current):null;
   const others=(spaceInfo&&spaceInfo.spaces||[]).filter(s=>!s.current);
   const curDesc=cur?`${cur.name}${cur.owner?'（我建的）':''}${cur.members?` · 成员 ${cur.members}`:''}${cur.user?` · ${cur.user}`:' · 未接账号'}`:'读取中…';
   const switchRow=others.length>0?(
     <div className="tw-preference-row" title="切到本机已有的其它空间档——库、密钥、会话随档走，互不干扰。">
       <div><strong>切换空间</strong></div>
       <select value="" style={{width:230}} onChange={async e=>{if(!e.target.value)return;try{await inv2('space_use',{name:e.target.value});await reloadAfterSpace()}catch(err){notify('切换失败：'+err)}}}>
         <option value="">选择空间…</option>
         {others.map(s=><option key={s.name} value={s.name}>{s.name}{s.user?'':'（空档）'}</option>)}
       </select>
     </div>):null;
   return <>
     <div className="tw-preference-row" title="空间 = 虚拟号：老板可建多个，各自独立库与密钥；用邀请码拉人共用。成员凭邀请码在自己机器上建档，离职即「噶关联」。">
       <div><strong>当前空间</strong></div>
       <span className="tw-space-cur">{curDesc}</span>
     </div>
     {switchRow}
     <div className="tw-preference-row" title="新建一个空间：独立数据目录与独立超级密钥，建好后需为其注册账号。">
       <div><strong>新建空间</strong></div>
       <div className="tw-pref-ctrl">
         <input value={newSpace} onChange={e=>setNewSpace(e.target.value)} style={{width:230}} placeholder="空间名"/>
         <button className="button" onClick={async()=>{const n=newSpace.trim();if(!n)return;try{await inv2('space_create',{name:n});setNewSpace('');await reloadAfterSpace()}catch(err){notify('建空间失败：'+err)}}}>建空间</button>
       </div>
     </div>
     <div className="tw-preference-row" title="邀请码含本空间超级密钥，须走可信渠道发给成员；勾「只读成员」则对方只能翻记忆不能写。">
       <div><strong>邀请成员</strong></div>
       <div className="tw-pref-ctrl">
         <label className="tw-space-check"><input type="checkbox" checked={inviteReadonly} onChange={e=>setInviteReadonly(e.target.checked)}/>只读成员</label>
         <button className="button" onClick={async()=>{try{setInviteOut(await inv2('space_invite',{readonly:inviteReadonly}))}catch(err){notify('生成邀请码失败：'+err)}}}>生成邀请码</button>
         <button className="button" onClick={async()=>{try{setMembersOut(await inv2('space_members',{}))}catch(err){notify('读取成员失败：'+err)}}}>成员列表</button>
       </div>
     </div>
     {roMode&&<div className="tw-space-note danger">🔒 本空间处于只读模式：只能查忆，写命令会被本机与服务端双重拒绝。需写入请联系空间所有者。</div>}
     {inviteOut&&<div className="tw-space-block">
       <div className="tw-space-block-hint">邀请码（含超级密钥，须走可信渠道；成员侧在「加入空间」粘贴）：</div>
       <textarea readOnly rows={3} value={inviteOut.code||''}/>
       <div className="tw-space-block-actions"><button className="button" onClick={async()=>{try{await navigator.clipboard.writeText(inviteOut.code||'');notify('邀请码已复制')}catch{notify('复制失败，请手动选择')}}}>复制邀请码</button></div>
     </div>}
     {membersOut&&<div className="tw-space-block">
       <div className="tw-space-block-hint">成员会话（离职即「噶关联」——撤销后其访问立即失效）：</div>
       {(membersOut.members||[]).length===0?<div className="tw-space-empty">未签发过成员会话</div>:
         (membersOut.members||[]).map(m=><div key={m.session_id} className="tw-space-member">
           <code>{String(m.session_id).slice(0,8)}</code>
           <span className="tw-space-member-name">{m.device_name}</span>
           {m.readonly?<span className="tw-space-badge">只读</span>:null}
           <span className="tw-space-member-time">{m.issued_at}</span>
           <button className="button" onClick={async()=>{if(!confirm('噶掉该成员关联？其对该空间的访问立即失效（历史数据无法收回）'))return;try{await inv2('space_kick',{session:m.session_id,all:false});setMembersOut(await inv2('space_members',{}));notify('已噶关联')}catch(err){notify('噶关联失败：'+err)}}}>噶关联</button>
         </div>)}
     </div>}
     <div className="tw-preference-row" title="粘贴别人给你的邀请码，在本机建该空间的档并切入。">
       <div><strong>加入空间</strong></div>
       <div className="tw-pref-ctrl">
         <input value={joinCode} onChange={e=>setJoinCode(e.target.value)} style={{width:230}} placeholder="粘贴邀请码"/>
         <button className="button" onClick={async()=>{const c=joinCode.trim();if(!c)return;try{await inv2('space_join',{code:c});setJoinCode('');await reloadAfterSpace()}catch(err){notify('加入失败：'+err)}}}>加入</button>
       </div>
     </div>
   </>;
 })();
 const runDoctor=async()=>{try{const r=await inv2('doctor');setDoctorInfo(r)}catch(e){notify('自检失败：'+e)}};
 const doctorRow=doctorInfo?(<div className="tw-preference-row"><div><strong>自检</strong><span>{doctorInfo.items.map(it=>`${it.ok?'✅':'❌'}${it.item}`).join('　')}</span></div><span className={'sv-state '+(doctorInfo.all_ok?'sv-state-current':'sv-state-pending')}>{doctorInfo.all_ok?'全部通过':'有异常'}</span></div>)
   :<div className="tw-preference-row" title="模型 / 库 / 锁 / 远程 / 注入 / 作用域，一站式体检。"><div><strong>自检</strong></div><button className="button" onClick={runDoctor}>运行 doctor</button></div>;
 const row=(label,desc,node)=>(<div className="tw-preference-row" title={typeof desc==='string'?desc:undefined}><div><strong>{label}</strong></div>{node}</div>);
 // The optional cross-encoder reranker is separate from the bundled embedding model.
 const [rk,setRk]=useState(null);const [rkBusy,setRkBusy]=useState(false);const [rkMsg,setRkMsg]=useState('');
 useEffect(()=>{(async()=>{if(!NATIVE)return;try{setRk(await inv2('rerank_model_status'))}catch{}})()},[]);
 useEffect(()=>{if(!NATIVE||!window.__TAURI__?.event)return;
   let un;try{un=window.__TAURI__.event.listen('rerank-install://progress',e=>setRkMsg(String(e.payload||'')))}catch{}
   return()=>{try{un&&un()}catch{}}},[]);
 const installRerank=async()=>{
   if(rkBusy)return;setRkBusy(true);setRkMsg('准备下载…');
   try{const r=await inv2('rerank_model_install');setRk(await inv2('rerank_model_status'));notify(r&&r.skipped?'精排模型已存在，未重复下载':'精排模型安装完成 · recall 将启用精排')}
   catch(e){notify('安装失败：'+e)}
   finally{setRkBusy(false);setRkMsg('')}};
 const rerankRow=(<div className="tw-preference-row"><div><strong>精排模型（可选）</strong><span>{rk?(rk.installed?`已安装 · ${rk.size_mb}MB · recall 自动启用 cross-encoder 精排`:'未安装——装后可显著减少「词面相近而语义无关」的误召回'):'读取中…'}{rkBusy&&rkMsg?` · ${rkMsg}`:''}</span></div>{rk&&!rk.installed?<button className="button" disabled={rkBusy||!NATIVE} onClick={installRerank}>{rkBusy?'下载中…':'安装（约 280MB）'}</button>:<span className={'sv-state '+(rk&&rk.installed?'sv-state-current':'sv-state-pending')}>{rk&&rk.installed?'已就绪':'未安装'}</span>}</div>);
 // Vault v4 key maintenance resets the super password without changing data and exports recovery material.
 const [keyBusy,setKeyBusy]=useState(false);const [keyMsg,setKeyMsg]=useState('');const [exported,setExported]=useState('');
 const [newSuperKey,setNewSuperKey]=useState('');
 const doSuperReset=async()=>{
  if(keyBusy)return;
  if(!confirm('重签超级密码？数据零改动，但旧码立刻作废——新码抄录丢了云上数据将永久无法解锁。'))return;
  setKeyBusy(true);setKeyMsg('');
  try{
   const r=await inv2('super_reset');
   if(!r||!r.super)throw new Error('未返回新超级密码');
   setKeyMsg('');setExported('');
   notify('已签发新超级密码——请立刻抄录');
   setNewSuperKey(r.super);
  }catch(e){notify('重置失败：'+errText(e))}
  finally{setKeyBusy(false)}
 };
 const doKeysExport=async()=>{
  if(keyBusy)return;setKeyBusy(true);setKeyMsg('');
  try{
   const r=await inv2('keys_export');
   setExported(String(r&&r.text||''));
   notify('恢复资料已生成——就地抄录，勿入聊天/云盘/仓库');
  }catch(e){notify('导出失败：'+errText(e))}
  finally{setKeyBusy(false)}
 };
 const keysRow=(<>
  <div className="tw-preference-row" title="换码不换锁芯：用当前码解锁钥匙包，签发新码上云，记忆数据零改动。旧码立即作废。"><div><strong>重置超级密码</strong></div><button className="button" disabled={keyBusy||!NATIVE} onClick={doSuperReset}>{keyBusy?'处理中…':'重置'}</button></div>
  <div className="tw-preference-row" title="含超级密码与 vault 包裹材料——泄露即失守。新机接手、离线备份用。"><div><strong>导出密钥恢复资料</strong></div><button className="button" disabled={keyBusy||!NATIVE} onClick={doKeysExport}>导出</button></div>
  {exported&&<div className="tw-preference-row"><div style={{width:'100%'}}><strong>恢复资料（仅本机可见，勿入聊天/云盘/仓库）</strong><textarea readOnly rows={7} aria-label="密钥恢复资料" value={exported} style={{width:'100%',marginTop:8}}/><div style={{display:'flex',gap:8,marginTop:8}}><button className="button" onClick={async()=>{const ok=await copyText(exported);notify(ok?'已复制':'复制失败')}}>复制</button><button className="button" onClick={()=>setExported('')}>清除显示</button></div></div></div>}
  {newSuperKey&&<div className="tw-preference-row"><div style={{width:'100%'}}><SuperKeyReveal title="新超级密码已签发（旧码作废）。立刻抄录——服务器没有备份，丢了云上数据永久无法解锁。" superKey={newSuperKey} onDone={()=>setNewSuperKey('')} doneLabel="我已抄录，关闭"/></div></div>}
 </>);
 return <>
  {section==="data"&&<>{spaceRow}{row('数据目录',cfg?`${cfg.data_dir}（缺省 ${cfg.default_data_dir}；改后重启客户端生效）`:'读取中…',
    NATIVE
      ?<button className="button" onClick={async()=>{try{const dir=await inv2('pick_directory');if(!dir)return;await inv2('data_dir_set',{dir});setDd(dir);notify('数据目录已保存——重启客户端生效')}catch(e){notify('选择或保存失败：'+e)}}}>选择目录…</button>
      :<div style={{display:'flex',gap:6}}><input value={dd} onChange={e=>setDd(e.target.value)} style={{width:230}} placeholder="~/.respire"/><button className="button" onClick={async()=>{try{await inv2('data_dir_set',{dir:dd.trim()});notify('数据目录已保存——重启客户端生效')}catch(e){notify('保存失败：'+e)}}}>保存</button></div>)}</>}
  {section==="sync"&&<>{row('服务器地址',cfg?`当前 ${cfg.addr}（默认 ${cfg.default_addr}）`:'读取中…',
    <div style={{display:'flex',gap:6}}><input value={addr} onChange={e=>setAddr(e.target.value)} style={{width:230}}/><button className="button" onClick={async()=>{try{await inv2('server_addr_set',{addr:addr.trim()});setCfg({...cfg,addr:addr.trim()});notify('服务器地址已保存')}catch(e){notify('保存失败：'+e)}}}>保存</button></div>)}{row('自动同步',cfg?`写后自动同步：${cfg.autosync?'开':'关'}（ONEMEMORY_NO_AUTOSYNC 环境变量可强制关）`:'读取中…',
    <button className={'tw-switch '+(cfg&&cfg.autosync?'on':'')} type="button" role="switch" aria-checked={!!(cfg&&cfg.autosync)} aria-label="自动同步" onClick={async()=>{try{const nv=!(cfg&&cfg.autosync);await inv2('sync_config_set',{autosync:nv});setCfg({...cfg,autosync:nv})}catch(e){notify('切换失败：'+e)}}}><i/></button>)}{bridged&&st&&(<div className="tw-preference-row"><div><strong>账号</strong><span>{st.session?.user?('已登录：'+st.session.user+(cloudAuthed(st)?'（云端已连接）':'（云端未接）')):(statusInfo?.offline?'离线本机模式——记忆只存这台电脑，不跨设备（如需换机接续再登录）':'未接入云端——登录后可跨设备同步')}</span></div><div style={{display:'flex',gap:6}}>{st.session?.user&&cloudAuthed(st)&&<button className="button" onClick={async()=>{try{await inv2('logout',{full:false});notify('已注销云端会话（本地记忆与密钥保留）');if(onSessionChange)await onSessionChange()}catch(e){notify('注销失败：'+errText(e))}}}>注销云端</button>}{st.session?.user&&!cloudAuthed(st)&&<button className="button primary" onClick={()=>onOpenGate&&onOpenGate()}>重新连接云端</button>}{st.session?.user&&<button className="button" onClick={async()=>{try{await inv2('logout',{full:true});notify('已忘记身份；重接需超级密码');if(onSessionChange)await onSessionChange()}catch(e){notify('失败：'+errText(e))}}}>忘记本机身份</button>}{!st.session?.user&&<button className="button" onClick={()=>onOpenGate&&onOpenGate()}>{statusInfo?.offline?'改用云端账号（可选）':'登录 / 注册'}</button>}</div></div>)}</>}
  {section==="adv"&&<>{rerankRow}{keysRow}{doctorRow}</>}
 </>;
}

/** Font settings enumerate system families through Tauri or accept a manual family. UI scaling and body typography are independent and persist in localStorage. */
function FontPanel({look,patch,notify}){
 const [fonts,setFonts]=useState(null);
 const [source,setSource]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{(async()=>{
  if(!window.__TAURI__?.core?.invoke)return;
  try{const r=await inv('list_system_fonts');setFonts(Array.isArray(r?.fonts)?r.fonts:[]);setSource(r?.source||'')}catch(e){notify&&notify('读取系统字体失败：'+errText(e))}
 })()},[]);
 // A font filename is not necessarily its CSS family name.
 // Invalid stored family names can make changes appear ineffective.
 // After enumeration, reset unavailable stored families and ask the user to select again.
 useEffect(()=>{
  if(!Array.isArray(fonts)||!fonts.length)return;
  const valid=new Set(fonts.map(n=>n==='系统默认'?'':n));
  const stale=['uiFont','readFont'].filter(k=>look[k]&&!valid.has(look[k]));
  if(stale.length){patch(Object.fromEntries(stale.map(k=>[k,''])));notify&&notify('已重置无效字体名（旧版枚举的是文件名）——请重新选择字体')}
 },[fonts]);
 const pick=(key,label,hint)=><div className="tw-preference-row" title={hint+(fonts?`（已枚举 ${fonts.length-1} 个族，来源 ${source||'系统'}）`:'')}><div><strong>{label}</strong></div>
  {fonts?<select style={{width:250}} aria-label={label} value={look[key]} onChange={e=>patch({[key]:e.target.value})}>
    {fonts.map(n=><option key={n} value={n==='系统默认'?'':n}>{n}</option>)}
   </select>
  :<input style={{width:250}} aria-label={label} value={look[key]} placeholder="族名，如 Noto Sans CJK SC" onChange={e=>patch({[key]:e.target.value})}/>}
 </div>;
 return <>
  {pick('uiFont','界面字体','菜单、树、按钮等界面文字所用字体族')}
  {pick('readFont','正文字体','记忆正文所用字体族；衬线族更宜长文阅读')}
  <div className="tw-preference-row" title="整体放大或缩小界面（含间距）——屏幕大或视力吃力时用。"><div><strong>界面缩放</strong></div>
   <div className="view-tabs">{UI_SCALES.map(s=><button key={s.value} className={Math.abs(look.uiScale-s.value)<0.001?'active':''} onClick={()=>patch({uiScale:s.value})}>{s.label}</button>)}</div>
  </div>
  <div className="tw-preference-row" title="仅影响记忆正文，界面文字另走上面的缩放。"><div><strong>正文字号</strong></div>
   <div style={{display:'flex',gap:8,alignItems:'center'}}>
    <input type="range" aria-label="正文字号" min={READ_SIZE_RANGE[0]} max={READ_SIZE_RANGE[1]} value={look.readSize} onChange={e=>patch({readSize:Number(e.target.value)})}/>
    <button className="button" onClick={()=>patch({readSize:14})}>恢复 14</button>
   </div>
  </div>
  <div className="tw-preference-row" title="仅影响记忆正文的行距倍数。"><div><strong>正文行距</strong></div>
   <div style={{display:'flex',gap:8,alignItems:'center'}}>
    <input type="range" aria-label="正文行距" min={READ_LH_RANGE[0]} max={READ_LH_RANGE[1]} step={0.05} value={look.readLh} onChange={e=>patch({readLh:Number(e.target.value)})}/>
    <button className="button" onClick={()=>patch({readLh:2.15})}>恢复 2.15</button>
   </div>
  </div>
  <div className="tw-preference-row" title="字体回内置栈（霞鹜漫黑），缩放 100%，正文字号 14px、行距 2.15。"><div><strong>恢复外观缺省</strong></div>
   <button className="button" disabled={busy} onClick={()=>{patch({uiFont:'',readFont:'',uiScale:1,readSize:14,readLh:2.15});notify&&notify('外观已恢复缺省')}}>重置</button>
  </div>
 </>;
}

/** Render labeled memory-body sections with --read-size and --read-lh typography preferences. */
function ReadingContent({content}){
 const blocks=splitReadingBlocks(content);
 if(!blocks.length)return <p className="tw-reading-empty">（这条记忆没有正文）</p>;
 return <>{blocks.map((block,bi)=>
  block.marked
   ? <div className="tw-reading-block is-marked" key={bi}>{block.lines.map((line,li)=>
      line.tag
       ? <p className="tw-marked-line" key={li}><span className="tw-marked-tag">{line.tag}</span><span>{line.text}</span></p>
       : <p className="plain-line" key={li}>{line.text}</p>
     )}</div>
   : <div className="tw-reading-block" key={bi}>{block.lines.map((line,li)=><p key={li}>{line.text}</p>)}</div>
 )}</>;
}

function errText(e){
 if(typeof e==='string')return e;
 if(e&&typeof e.message==='string')return e.message;
 try{return JSON.stringify(e)}catch{return String(e)}
}
function cloudAuthed(st){
 return !!(st&&st.session&&st.session.has_token);
}
/** Display cloud vault super passwords at issuance and require confirmation that recovery material has been saved. Offline setup does not show this card. */
function SuperKeyReveal({title,superKey,onDone,doneLabel='我已抄录保存'}){
 const [saved,setSaved]=useState(false);
 return <div>
  <p role="alert" style={{color:'#b42318',fontWeight:700,marginBottom:10}}>{title}</p>
  <div style={{border:'2px solid #b42318',color:'#b42318',background:'#fff5f5',padding:'12px',borderRadius:8,fontFamily:'ui-monospace,Consolas,monospace',fontWeight:700,wordBreak:'break-all'}}>{superKey||'（未返回）'}</div>
  <div style={{display:'flex',gap:10,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
   <label style={{display:'flex',gap:8,alignItems:'center',fontSize:13}}><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>我已妥善保存（纸上／密码管理器）</label>
   <button className="button" type="button" onClick={async()=>{const ok=await copyText(superKey||'');if(ok)setSaved(true)}}><Copy size={13}/>复制</button>
  </div>
  <p className="tw-demo-note">服务器没有备份。忘记了没有任何人能帮你找回，云上数据将永久无法解锁查看。</p>
  <footer className="modal-footer"><button className="button primary" type="button" disabled={!!superKey&&!saved} onClick={onDone}>{doneLabel}</button></footer>
 </div>;
}

function AccountGate({notify,onDone,bootError}){
 const inv2=(c,a={})=>{const f=window.__TAURI__?.core?.invoke;return f?f(c,a):Promise.reject(new Error("非本地客户端（未连 Tauri）"))};
 const [mode,setMode]=useState('login');
 const [f,setF]=useState({addr:'https://api.rsrs.rs',user:'',pass:'',confirm:'',super:''});
 const [busy,setBusy]=useState(false);
 const [formError,setFormError]=useState('');
 const [hold,setHold]=useState(null);
 const [resetNeeded,setResetNeeded]=useState(false);
 const [hideSuper,setHideSuper]=useState(false);
 const [preparing,setPreparing]=useState(true);
 const set=k=>e=>setF(o=>({...o,[k]:e.target.value}));
 useEffect(()=>{
  let dead=false;
  (async()=>{
   try{
    const r=await inv2('resume_session');
    if(dead)return;
    const addr=(r&&r.addr)||'https://api.rsrs.rs';
    setF(o=>({...o,addr,user:(r&&r.user)||o.user}));
    if(r&&r.has_super)setHideSuper(true);
    if(r&&r.error)setFormError(String(r.error).slice(0,400));
    if(r&&r.super_issued){setHold({kind:'issued',super:r.super_issued});setPreparing(false);return}
    if(r&&r.resumed){notify('已用本机会话进入');onDone();return}
   }catch{}
   try{
    const s=await inv2('server_addr_get');
    if(!dead&&s&&s.addr)setF(o=>({...o,addr:s.addr}));
   }catch{}
   if(!dead)setPreparing(false);
  })();
  return()=>{dead=true};
 },[]);
 const fail=msg=>{setFormError(msg);notify(msg)};
 const doLogin=async resetVault=>{
  const r=await inv2('login',{addr:f.addr.trim(),user:f.user.trim(),pass:f.pass,superPass:f.super||null,resetVault});
  if(r&&r.ok===false)throw new Error(r.error||r.message||'登录失败');
  // When vault migration issues a super password, display it for the user to save.
  if(r&&r.super_issued)setHold({kind:'issued',super:r.super_issued});
  else{notify('登录成功');onDone()}
 };
 const submit=async e=>{
  e.preventDefault();if(busy||hold)return;setBusy(true);setFormError('');setResetNeeded(false);
  try{
   if(mode==='login'){
    if(!f.pass)throw new Error('请填登录密码');
    await doLogin(false);
   }else if(mode==='register'){
    if(f.pass.length<8)throw new Error('登录密码至少 8 位');
    if(f.pass!==f.confirm)throw new Error('两次登录密码不一致');
    // Vault v4 registration generates the super password instead of accepting it as input.
    const r=await inv2('register',{addr:f.addr.trim(),user:f.user.trim(),pass:f.pass});
    if(r&&r.ok===false)throw new Error(r.error||r.message||'注册失败');
    if(!r||!r.super)throw new Error('注册未返回超级密码——请升级 CLI 后重试');
    setHold({kind:'register',user:(r&&r.user)||f.user.trim(),super:r.super});
   }else{
    // Offline setup stores generated local keys in the system keyring.
    // The CLI rejects overwriting cloud key material without explicit confirmation.
    try{
     await inv2('keygen');
     notify('已启用离线本机模式——记忆只存这台电脑');
     onDone();
    }catch(err){
     const msg=errText(err);
     if(!/已有密钥材料|--force/.test(msg))throw err;
     if(!confirm('本机已有云端密钥材料。离线模式会覆写它并断开云端会话——确认改为纯本机离线？\n\n（建议先「工作区设置 → 导出密钥恢复资料」备份超级密码）'))return;
     await inv2('keygen',{force:true});
     notify('已切换为离线本机模式（原云端会话已断开）');
     onDone();
    }
   }
  }catch(err){
   const msg=errText(err).slice(0,400);
   // Require explicit data-reset confirmation when remote data exists without a usable local vault wrapper.
   if(mode==='login'&&/reset-vault|放弃旧数据|覆盖保护/.test(msg))setResetNeeded(true);
   fail(msg);
  }
  setBusy(false);
 };
 const tabs=[['login','登录'],['register','注册'],['keygen','离线本机']];
 return <Modal title="接入记忆库" onClose={()=>{if(!busy)onDone()}} wide>
  {bootError&&<p className="tw-demo-note" style={{color:'#b0574f'}}>未连上本地记忆库：{bootError}——请先「工作区设置 → 安装 CLI」或升级 CLI 后重试。</p>}
  {formError&&<p role="alert" className="tw-demo-note" style={{color:'#b0574f'}}>{formError}</p>}
  {resetNeeded&&f.pass&&<div className="tw-permission-notice" style={{background:'#fff5f5'}}><WarningCircle size={16}/><div><p>服务器已有该账号的数据，但本机没有对应的钥匙包裹（换机或旧钥匙已失？）。</p><button className="button" type="button" disabled={busy} onClick={async()=>{if(!confirm('确认放弃云端旧数据、以本机新钥匙为起点？旧密文将永久无法解开。'))return;setBusy(true);setFormError('');try{await doLogin(true)}catch(e){fail(errText(e).slice(0,400))}setBusy(false)}}>以本机新钥匙为起点（放弃旧数据）</button></div></div>}
  {hold?.kind==='register'&&<SuperKeyReveal title={`注册成功：${hold.user||''}。立刻抄录超级密码——这是解开记忆的唯一钥匙，服务器没有备份。`} superKey={hold.super} onDone={onDone}/>}
  {hold?.kind==='issued'&&<SuperKeyReveal title="本机账号已升级 v4 单因子密钥：这是超级密码（旧口令退出加密域），立刻抄录。" superKey={hold.super} onDone={onDone} doneLabel="我已抄录，进入记忆库"/>}
  {preparing&&!hold&&<p className="tw-demo-note">正在从本机会话和系统密钥环接入…</p>}
  {!hold&&!preparing&&<>
  <div className="view-tabs" style={{marginBottom:12}}>{tabs.map(([k,l])=><button key={k} type="button" className={mode===k?'active':''} disabled={busy} onClick={()=>{setMode(k);setFormError('');setResetNeeded(false)}}>{l}</button>)}</div>
  <form onSubmit={submit}>
   {mode!=='keygen'&&<label>服务器地址<input required value={f.addr} onChange={set('addr')} disabled={busy}/></label>}
   {mode!=='keygen'&&<label>用户名<input required value={f.user} onChange={set('user')} disabled={busy}/></label>}
   {mode==='login'&&<><label>登录密码<input required type="password" value={f.pass} onChange={set('pass')} disabled={busy}/></label>
    {!hideSuper&&<label>超级密码（解密用；本机密钥环已有则留空）<input type="password" value={f.super} onChange={set('super')} disabled={busy}/></label>}
    <p className="tw-demo-note">{hideSuper?'超级密码已从系统密钥环读取，不用再填。登录密码只在这台机器还没存过时要填一次，之后也从密钥环取。':'新设备：填登录密码 + 超级密码即可接续（超级密码丢了就无法解开云上记忆）。'}</p></>}
   {mode==='register'&&<><label>登录密码（进服务器用，可重置；至少 8 位）<input required type="password" value={f.pass} onChange={set('pass')} disabled={busy}/></label>
    <label>再次输入登录密码<input required type="password" value={f.confirm} onChange={set('confirm')} disabled={busy}/></label>
    <p className="tw-demo-note">超级密码由系统生成（A3- 恢复码），注册完成后立刻抄录。登录密码进服务器，超级密码解记忆，二者分工。</p></>}
   {mode==='keygen'&&<>
    <div className="tw-permission-notice" style={{background:'#fffbf0'}}><Info size={16}/><div>
     <p><strong>离线本机模式：只用这台电脑，不连服务器。</strong></p>
     <p>不需要注册、不需要密码、不生成需要抄录的恢复码——本机钥匙自动存进系统密钥环，日常使用无感。</p>
     <p>代价：记忆只存本机数据目录，<strong>不跨设备、无云端备份</strong>；这台电脑坏了或系统重装，记忆就没了。想换机接续，请用「注册」或「登录」。</p>
    </div></div>
   </>}
   <footer className="modal-footer"><button className="button primary" type="submit" disabled={busy}>{busy?'进行中…':(mode==='keygen'?'启用离线本机模式':mode==='register'?'生成超级密码并注册':'接入')}</button></footer>
  </form>
  </>}
 </Modal>;
}

export default function TreeClient(){
 const [backupBusy,setBackupBusy]=useState(false);
 const [backupResult,setBackupResult]=useState('');
 const [backupSnapshot,setBackupSnapshot]=useState(null);
 const [recoveryText,setRecoveryText]=useState('');
 const recoveryRequest=useRef(0);
 const [syncBusy,setSyncBusy]=useState(false);
 const [reembedBusy,setReembedBusy]=useState(false);
 const [updInfo,setUpdInfo]=useState(null);      // Update check result: {current,latest,outdated}.
 const [updBusy,setUpdBusy]=useState(false);
 const [ctxMenu,setCtxMenu]=useState(null);
 const [syncResult,setSyncResult]=useState('');
 const [syncFailed,setSyncFailed]=useState(false);
 const [statusCountsError,setStatusCountsError]=useState('');
 const [memories,setMemories]=useState(()=>NATIVE?[]:loadMemories());
 const [bridged,setBridged]=useState(false);
 const [statusInfo,setStatusInfo]=useState(null);
 const [showGate,setShowGate]=useState(false);
 const [bootError,setBootError]=useState(null);
 const [saving,setSaving]=useState(false);const [deleting,setDeleting]=useState(false);
 const [readingMemory,setReadingMemory]=useState(false);const selectionRequest=useRef(0);
 const nativeRefresh=useRef(null);
 const [refreshError,setRefreshError]=useState('正在检查自动刷新…');
 const doBoot=(keepView=false)=>nativeRefresh.current?.refresh({force:true,keepView});

 const [nodes,setNodes]=useState(()=>{if(NATIVE)return realTree([]);const saved=read('respire-tree-nodes-v1',null);const initial=initialTree(memories);if(!Array.isArray(saved)||!saved.some(n=>n.id===ROOT_ID))return initial;const known=new Set(saved.map(n=>n.id));const live=saved.filter(n=>n.kind!=='memory'||memories.some(m=>m.id===n.memoryId));const liveIds=new Set(live.map(n=>n.id));return [...live.map(n=>n.id!==ROOT_ID&&!liveIds.has(n.parentId)?{...n,parentId:ROOT_ID}:n),...memories.filter(m=>!known.has(m.id)).map(m=>({id:m.id,memoryId:m.id,title:m.title,kind:'memory',parentId:ROOT_ID}))]});
 const [grants,setGrants]=useState(()=>NATIVE?[]:(read('respire-tree-grants-v1',null)||[{id:'grant-claude',tool:'Claude',destination:'Claude Desktop · 个人工作区',scopeId:'tree-product',permission:'read',syncMode:'auto',enabled:true},{id:'grant-codex',tool:'Codex',destination:'Codex · 编程练习平台',scopeId:'mem-04',permission:'write',syncMode:'manual',enabled:true}].filter(g=>nodeById(nodes,g.scopeId)).map(g=>captureScope(g,nodes,memories))));
 const [selected,setSelected]=useState(()=>{const hash=new URLSearchParams(location.hash.slice(1)).get('node');if(nodes.some(n=>n.id===hash))return hash;return NATIVE?ROOT_ID:'tree-product'});
 const [expanded,setExpanded]=useState(()=>NATIVE?new Set([ROOT_ID,DIARY_ID]):new Set([ROOT_ID,'tree-product','tree-coding','mem-04','mem-05']));
 const [page,setPage]=useState('tree');const [view,setView]=useState('tree');const [search,setSearch]=useState('');const [searchOpen,setSearchOpen]=useState(false);const [editor,setEditor]=useState(null);const [installDialog,setInstallDialog]=useState(null);const [shareDialog,setShareDialog]=useState(null);const [moveDialog,setMoveDialog]=useState(null);const [deleteDialog,setDeleteDialog]=useState(null);const [newMenu,setNewMenu]=useState(false);const [moreMenu,setMoreMenu]=useState(false);const [preferences,setPreferences]=useState(false);const [prefTab,setPrefTab]=useState("data");const [help,setHelp]=useState(false);const [mobileSide,setMobileSide]=useState(false);const [inspector,setInspector]=useState(true);const [theme,setTheme]=useState(()=>read('respire-demo-theme','light'));const [toast,setToast]=useState(null);const [syncing,setSyncing]=useState([]);const [autoSync,setAutoSync]=useState(()=>read('respire-tree-auto','true')!==false);const [lastSavedAt,setLastSavedAt]=useState(new Date().toISOString());const [exportPreview,setExportPreview]=useState(false);const [cureList,setCureList]=useState(null);const [cureBusy,setCureBusy]=useState(false);const [userLabel,setUserLabel]=useState(null);const [injectStat,setInjectStat]=useState({fresh:0,total:0});
 const [activity,setActivity]=useState(()=>NATIVE?[]:read('respire-tree-activity-v1',[{id:'sample-install',nodeId:'tree-product',kind:'installed',title:'将「产品与灵感」安装到 Claude',detail:'只读 · 包含全部后代 · 持续同步',at:new Date().toISOString()},{id:'sample-codex',nodeId:'mem-04',kind:'installed',title:'Codex 已连接「编程练习平台」',detail:'读写 · 手动更新 · 示例配置',at:new Date(Date.now()-3600000).toISOString()}]));
 const undoRef=useRef();const toastTimer=useRef();const syncTimers=useRef([]);const syncJobs=useRef(new Map());const latestGrants=useRef(grants);latestGrants.current=grants;const fileInput=useRef();const importBusy=useRef(false);
 const diaryDays=useMemo(()=>nodes.filter(n=>n.parentId===DIARY_ID).map(n=>({day:n.title,id:n.id,items:nodes.filter(x=>x.parentId===n.id).map(x=>({id:x.id,title:x.title}))})).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.day)).sort((a,b)=>b.day.localeCompare(a.day)),[nodes]);
 // Diary detail modal: selecting a date lists entries; selecting an entry opens its body.
 const [diaryDay,setDiaryDay]=useState(null);const [diaryDetail,setDiaryDetail]=useState(null);const [diaryLoading,setDiaryLoading]=useState(false);
 const current=nodeById(nodes,selected)||nodeById(nodes,ROOT_ID);const memory=current?.kind==='memory'?memories.find(m=>m.id===current.memoryId):null;const path=pathFor(nodes,current?.id);const scope=memoriesInScope(nodes,memories,current?.id);const children=nodes.filter(n=>n.parentId===current?.id);const enriched=enrichGrants(grants,nodes,memories,syncing);const access=grantsForNode(enriched,nodes,current?.id);const coveredTargets=enriched.filter(g=>subtreeIds(nodes,current?.id).includes(g.scopeId)||subtreeIds(nodes,g.scopeId).includes(current?.id));
 // Selecting the diary opens today's calendar view.
 // Keep the calendar in the main view and entry details in a modal.
 const openDiaryEntry=async id=>{
  const known=memories.find(m=>m.id===id);
  if(known&&known.content){setDiaryDetail(known);return}
  setDiaryLoading(true);
  try{const fresh=await readMemory(id);setDiaryDetail(fresh)}
  catch(e){notify('读取详情失败：'+errText(e))}
  finally{setDiaryLoading(false)}
 };
 // Poll only the CLI-resolved opaque revision. No plaintext list reads while unchanged.
 // Live guards are checked after every await as well as before starting a request.
 const refreshState=useRef(null);
 refreshState.current={editor,saving,deleting,readingMemory,syncBusy,backupBusy,reembedBusy,
  searchOpen,installDialog,moveDialog,deleteDialog,shareDialog,preferences,help,showGate,diaryDay,diaryDetail};
 const refreshCallbacks=useRef(null);
 refreshCallbacks.current={
  apply:({status:st,memories:real,injectTargets},{keepView,profileChanged})=>{
   if(Array.isArray(injectTargets))setInjectStat({fresh:injectTargets.filter(x=>x.state==='fresh').length,total:injectTargets.length});
   selectionRequest.current++;
   setStatusInfo(st);setBootError(null);setStatusCountsError('');
   if(profileChanged||!st.unlocked||st?.session?.user!==userLabel||cloudAuthed(st)!==cloudAuthed(statusInfo)){
    setSyncResult('');setSyncFailed(false);
   }
   if(st.unlocked){
    setMemories(real);setBridged(true);setNodes(realTree(real));setGrants([]);
    if(!keepView||profileChanged){
     setExpanded(new Set([ROOT_ID,DIARY_ID,...real.filter(m=>!m.parentId&&m.importance!=='trivial').slice(0,12).map(m=>m.id)]));
     setSelected(ROOT_ID);
    }else{
     const ids=new Set(realTree(real).map(node=>node.id));
     setSelected(previous=>ids.has(previous)?previous:ROOT_ID);
    }
    setUserLabel(st?.session?.user||null);
   }else{
    recoveryRequest.current++;
    setBridged(false);setMemories([]);setNodes(realTree([]));setGrants([]);setUserLabel(null);
    setSelected(ROOT_ID);setRecoveryText('');setShowGate(true);
   }
  },
  reportError:message=>{setRefreshError(message);if(message&&!bridged)setBootError(message)},
 };
 useEffect(()=>{
  if(!NATIVE)return;
  const controller=createMemoryRefresh({
   readRevision:()=>inv('memory_revision'),
   readSnapshot:async options=>{const snapshot=await readMemorySnapshot(inv,bootSnapshot,options);try{snapshot.injectTargets=await inv('inject_targets')}catch{}return snapshot},
   apply:(...args)=>refreshCallbacks.current.apply(...args),
   reportError:message=>refreshCallbacks.current.reportError(message),
   isPaused:({force})=>{
    const state=refreshState.current;
    const hard=state.editor||state.saving||state.deleting||state.readingMemory||state.syncBusy||state.backupBusy||state.reembedBusy;
    return hard||(!force&&(document.hidden||Object.values(state).some(Boolean)||document.querySelector('[role="dialog"]')));
   },
  });
  nativeRefresh.current=controller;
  controller.refresh({force:true,keepView:false});
  const poll=()=>controller.refresh();
  const visible=()=>{if(document.hidden)controller.invalidate();else poll()};
  const interval=setInterval(poll,5000);
  document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visible);controller.dispose();if(nativeRefresh.current===controller)nativeRefresh.current=null};
 },[]);
 // Entering protection invalidates old reads; closing a dialog may start a new forced read.
 const previousRefreshState=useRef({});
 useEffect(()=>{if(protectionEntered(previousRefreshState.current,refreshState.current))nativeRefresh.current?.invalidate();previousRefreshState.current=refreshState.current},[editor,saving,deleting,readingMemory,syncBusy,backupBusy,reembedBusy,searchOpen,installDialog,moveDialog,deleteDialog,shareDialog,preferences,help,showGate,diaryDay,diaryDetail]);
 useEffect(()=>{if(bridged)setNodes(realTree(memories))},[bridged,memories]);
 // The diary_mode agent setting controls how much incidental activity AI records.
 const [diaryVerbose,setDiaryVerbose]=useState(false);const [diaryBusy,setDiaryBusy]=useState(false);
 useEffect(()=>{if(preferences){inv('diary_mode_get').then(r=>setDiaryVerbose(r?.diary_mode==='verbose')).catch(()=>{})}},[preferences]);
 const toggleDiary=async()=>{setDiaryBusy(true);try{const nv=!diaryVerbose;await inv('diary_mode_set',{mode:nv?'verbose':'concise'});setDiaryVerbose(nv);notify(nv?'已开启琐事详记：逐条记录':'已切回轨迹档：琐事一日一条')}catch(e){notify('切换失败：'+errText(e))}finally{setDiaryBusy(false)}};
 const notify=(text,undo,actionLabel='撤销')=>{undoRef.current=undo;clearTimeout(toastTimer.current);setToast({text,undo,actionLabel});toastTimer.current=setTimeout(()=>{undoRef.current=null;setToast(null)},undo?30000:4000)};
 const log=(kind,title,nodeId,detail='')=>{setActivity(a=>[{id:makeNodeId(),kind,title,nodeId,detail,at:new Date().toISOString()},...a]);setLastSavedAt(new Date().toISOString())};
 const paintNative=list=>{nativeRefresh.current?.invalidate();setMemories(list);setNodes(realTree(list))};
 const refreshNativeStatus=async()=>{
  try{
   const st=await inv('status');
   setStatusInfo(st);
   setStatusCountsError('');
  }catch(e){
   setStatusCountsError('本机计数刷新失败：'+errText(e));
  }
 };
 const refreshNativeList=async()=>{
  const list=await bridgeBoot();
  if(!Array.isArray(list))throw new Error('记忆列表读取失败');
  paintNative(list);
  await refreshNativeStatus();
 };
 const runCloudSync=async()=>{
  if(syncBusy)return {ok:false,message:'同步进行中'};
  if(!bridged){const message='记忆库未接入';notify(message);setSyncFailed(true);setSyncResult(message);return {ok:false,message}}
  setSyncBusy(true);
  setSyncResult('');
  setSyncFailed(false);
  try{
   const r=await inv('sync');
   if(!r||typeof r!=='object')throw new Error('同步未返回结果');
   if(typeof r.pulled!=='number'||typeof r.pushed!=='number')throw new Error('同步结果无效');
   let refreshError='';
   try{await refreshNativeList()}catch(e){refreshError=errText(e)}
   const message=`同步完成：拉 ${r.pulled} 推 ${r.pushed}${r.converged?'，已收敛':'，未收敛'}${refreshError?'；界面刷新失败：'+refreshError:''}`;
   notify(message);
   log('synced','云端同步',ROOT_ID,message);
   setSyncFailed(false);
   setSyncResult(message);
   return {ok:true,message,result:r,refreshError};
  }catch(e){
   const message='同步失败：'+errText(e);
   notify(message);
   setSyncFailed(true);
   setSyncResult(message);
   return {ok:false,message};
  }finally{setSyncBusy(false)}
 };
 const runBackupDb=async()=>{
  let path='';
  if(NATIVE){
   try{path=(await inv('pick_save_file',{defaultName:'onememory-backup.db'}))||''}
   catch(e){setBackupResult('选择保存位置失败：'+errText(e));return}
  }
  if(!path){setBackupResult('未选择备份目标路径（必须是尚不存在的新文件）');return}
  if(backupBusy||!bridged){if(!bridged)setBackupResult('记忆库未接入');return}
  setBackupBusy(true);setBackupResult('正在保存数据库快照…');
  try{
   const r=await inv('backup_db',{path});
   const dest=(r&&(r.backed_up||r.path))||path;
   setBackupResult(`数据库快照已保存到 ${dest}。安全恢复：准备一个全新空目录，把快照文件放入并命名为 onememory.db，再用该目录作为数据目录启动；不要覆盖当前数据目录。只复制数据库不够，还必须用同一把超级密码才能解密。记忆 JSON 导入是追加，不是完整库还原。`);
  }catch(e){setBackupResult('数据库快照失败：'+errText(e))}
  finally{setBackupBusy(false)}
 };
 const runExportMemoriesFile=async()=>{
  let path='';
  if(NATIVE){
   try{path=(await inv('pick_save_file',{defaultName:'respire-export.json'}))||''}
   catch(e){setBackupResult('选择保存位置失败：'+errText(e));return}
  }
  if(!path){setBackupResult('未选择记忆 JSON 文件路径');return}
  if(backupBusy||!bridged){if(!bridged)setBackupResult('记忆库未接入');return}
  setBackupBusy(true);setBackupResult('正在导出记忆 JSON…');
  try{
   const r=await inv('export_memories',{path});
   setBackupResult(`已导出 ${r&&r.exported!=null?r.exported:'?'} 条到 ${r&&r.path||path}（记忆 JSON，不是数据库快照，也不是完整库还原）`);
  }catch(e){setBackupResult('记忆 JSON 导出失败：'+errText(e))}
  finally{setBackupBusy(false)}
 };
 const runImportMemoriesFile=async()=>{
  let path='';
  if(NATIVE){
   try{path=(await inv('pick_open_file'))||''}
   catch(e){setBackupResult('选择导入文件失败：'+errText(e));return}
  }
  if(!path){setBackupResult('未选择记忆 JSON 文件路径');return}
  if(backupBusy||!bridged){if(!bridged)setBackupResult('记忆库未接入');return}
  setBackupBusy(true);setBackupResult('正在追加导入记忆 JSON…');
  try{
   const r=await inv('import_memories',{path});
   let refreshError='';
   try{await refreshNativeList()}catch(e){refreshError=errText(e)}
   setBackupResult(`已从记忆 JSON 追加导入 ${r&&r.imported!=null?r.imported:'?'} 条（跳过 ${r&&r.skipped||0}）。这是追加，不是完整库还原。${refreshError?'界面刷新失败：'+refreshError:''}`);
  }catch(e){setBackupResult('记忆 JSON 追加导入失败：'+errText(e))}
  finally{setBackupBusy(false)}
 };
 const revealRecoveryKey=async()=>{
  if(!bridged){notify('记忆库未接入');return}
  const request=++recoveryRequest.current;
  try{
   const r=await inv('keys_export');
   if(request!==recoveryRequest.current)return;
   const text=String(r&&r.text||'').trim();
   if(!text)throw new Error('未返回恢复资料');
   setRecoveryText(text);
   notify('恢复资料已显示——请离线抄录，勿入聊天/云盘/仓库');
  }catch(e){if(request===recoveryRequest.current)notify('读取恢复资料失败：'+errText(e))}
 };
 const select=async(id,onError)=>{
  const request=++selectionRequest.current;setReadingMemory(false);
  if(NATIVE&&isRealId(id)){
   setReadingMemory(true);
   try{
    const fresh=await readMemory(id);if(request!==selectionRequest.current)return false;
    setMemories(ms=>ms.some(m=>m.id===id)?ms.map(m=>m.id===id?fresh:m):[...ms,fresh]);
   }catch(e){if(request===selectionRequest.current){const message=e.message||String(e);if(onError)onError(message);else notify('读取失败：'+message)}return false}
   finally{if(request===selectionRequest.current)setReadingMemory(false)}
  }
  setSelected(id);setPage('tree');setMobileSide(false);setMoreMenu(false);setExpanded(set=>new Set([...set,...pathFor(nodes,id).map(n=>n.id)]));return true;
 };
 const startNew=kind=>{
  setNewMenu(false);
  if(NATIVE&&kind==='tree'){notify('树节点须为真实记忆，请新建记忆。');return}
  setEditor({node:{kind},parentId:current.id});
 };
 const editNode=node=>{
  setMoreMenu(false);
  if(NATIVE&&node.kind==='tree'){notify('本机虚拟节点（根/日记）不可重命名。');return}
  setEditor({node,parentId:node.parentId||ROOT_ID});
 };
 const copy=async value=>{try{await navigator.clipboard.writeText(value);notify('已复制')}catch{notify('浏览器限制了复制，请在地址栏或导出预览中复制。')}};
 useEffect(()=>{if(NATIVE)return;for(const [key,value] of [['respire-demo-memories-v2',memories],['respire-tree-nodes-v1',nodes],['respire-tree-grants-v1',grants],['respire-tree-activity-v1',activity],['respire-tree-auto',autoSync]]){try{localStorage.setItem(key,JSON.stringify(value))}catch{notify('本机存储空间不足，请立即导出备份。');break}}},[memories,nodes,grants,activity,autoSync]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('respire-demo-theme',JSON.stringify(theme))},[theme]);
 // Apply appearance before the first frame and persist preference changes immediately.
 const [look,setLook]=useState(()=>loadAppearance());
 useEffect(()=>{applyAppearance(look);saveAppearance(look)},[look]);
 const patchLook=patch=>setLook(v=>({...v,...patch}));
 useEffect(()=>{const key=e=>{if(document.querySelector('[role="dialog"]'))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&undoRef.current){e.preventDefault();const undo=undoRef.current;undoRef.current=null;undo();if(!NATIVE)notify('已撤销上一步');return}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true)}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();startNew(e.shiftKey?'tree':'memory')}if(e.key==='Escape'){setMoreMenu(false);setNewMenu(false);setMobileSide(false)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[current]);
 const refresh=(ids,automatic=false)=>{const targets=enriched.filter(g=>ids.includes(g.id)&&!syncing.includes(g.id));if(!targets.length)return;const job=makeNodeId();targets.forEach(g=>syncJobs.current.set(g.id,job));const targetIds=targets.map(g=>g.id);setSyncing(a=>[...new Set([...a,...targetIds])]);const timer=setTimeout(()=>{const valid=targets.filter(g=>syncJobs.current.get(g.id)===job&&latestGrants.current.some(live=>live.id===g.id));const validIds=valid.map(g=>g.id);setGrants(gs=>gs.map(g=>validIds.includes(g.id)?captureScope(g,nodes,memories):g));setSyncing(a=>a.filter(id=>!targetIds.includes(id)));valid.forEach(g=>log('synced',`已同步到 ${g.tool}`,g.scopeId,`${g.currentCount} 条记忆 · ${g.destination}`));if(!automatic&&valid.length)notify(`已更新 ${valid.length} 个目标（演示）`)},700);syncTimers.current.push(timer)};
 useEffect(()=>{if(!autoSync)return;const pending=enrichGrants(grants,nodes,memories).filter(g=>g.pending&&g.syncMode==='auto').map(g=>g.id);if(!pending.length)return;const timer=setTimeout(()=>refresh(pending,true),1000);return()=>clearTimeout(timer)},[grants,nodes,memories,autoSync]);
 useEffect(()=>()=>{clearTimeout(toastTimer.current);syncTimers.current.forEach(clearTimeout)},[]);
 const saveDemoNode=data=>{const existing=editor.node.id;const id=existing||makeNodeId();const stamp=new Date().toISOString();const parentId=editor.parentId;setNodes(ns=>existing?ns.map(n=>n.id===id?{...n,title:data.title}:n):[...ns,{id,parentId,title:data.title,kind:data.kind,...(data.kind==='memory'?{memoryId:id}:{})}]);if(data.kind==='memory'){setMemories(ms=>existing?ms.map(m=>m.id===id?{...m,title:data.title,content:data.content,summary:data.content.split('\n')[0].slice(0,100),type:data.type,updatedAt:stamp}:m):[...ms,{id,title:data.title,content:data.content,summary:data.content.split('\n')[0].slice(0,100),type:data.type,source:'手动记录',tags:[],relatedIds:[],collection:'product',parentId:null,createdAt:stamp,updatedAt:stamp}])}setExpanded(s=>new Set([...s,parentId]));setSelected(id);setView('tree');setPage('tree');setEditor(null);log(existing?'edited':'created',`${existing?'更新':'新建'}${data.kind==='tree'?'子树':'记忆'}「${data.title}」`,id,scopePath(nodes,parentId));notify(existing?'已保存 · 按作用域同步':'已添加到当前子树')};
 const saveNode=async data=>{
  if(saving) return;
  if(data.kind==='tree'){
   if(NATIVE){notify('树节点须为真实记忆，请新建记忆。');return}
   const existing=editor.node.id;const id=existing||makeNodeId();const parentId=editor.parentId;
   setNodes(ns=>existing?ns.map(n=>n.id===id?{...n,title:data.title}:n):[...ns,{id,parentId,title:data.title,kind:'tree'}]);
   setExpanded(s=>new Set([...s,parentId]));setSelected(id);setView('tree');setPage('tree');setEditor(null);
   log(existing?'edited':'created',`${existing?'更新':'新建'}子树「${data.title}」`,id,scopePath(nodes,parentId));
   notify(existing?'已保存':'已添加到当前子树');
   return;
  }
  if(!NATIVE){saveDemoNode(data);return}
  if(!bridged){notify('记忆库未接入');return}
  setSaving(true);
  setEditor(ed=>ed?{...ed,error:''}:ed);
  const existing=editor.node.id;const parentId=editor.parentId;
  try{
   if(existing&&isRealId(existing)){
    const saved=await updateMemory(existing,{title:data.title,content:data.content,type:data.type,tags:memories.find(m=>m.id===existing)?.tags||[],importance:data.importance});
    paintNative(memories.map(m=>m.id===saved.id?saved:m));
    setSelected(saved.id);
   }else{
    const parent=isRealId(parentId)?parentId:undefined;
    const saved=await createMemory({title:data.title,content:data.content,type:data.type,tags:[],parent,importance:data.importance});
    const without=existing?memories.filter(m=>m.id!==existing):memories;
    const next=without.some(m=>m.id===saved.id)?without.map(m=>m.id===saved.id?saved:m):[...without,saved];
    paintNative(next);
    setExpanded(s=>new Set([...s,parentId,saved.id]));
    setSelected(saved.id);
   }
   await refreshNativeStatus();
   setView('tree');setPage('tree');setEditor(null);
   log(existing?'edited':'created',`${existing?'更新':'新建'}记忆「${data.title}」`,existing||parentId,scopePath(nodes,parentId));
   notify(existing?'已保存':'已添加到当前子树');
  }catch(e){
   setEditor(ed=>ed?{...ed,error:e.message||String(e)}:ed);
   notify('保存失败：'+(e.message||e));
  }finally{setSaving(false)}
 };
 const saveInstall=config=>{const duplicate=grants.find(g=>g.scopeId===config.scopeId&&g.tool===config.tool&&g.destination===config.destination);const existingId=config.id||duplicate?.id;if(existingId){syncJobs.current.delete(existingId);setSyncing(a=>a.filter(id=>id!==existingId))}const grant=captureScope({...config,id:existingId||makeNodeId(),enabled:true},nodes,memories);setGrants(gs=>existingId?gs.map(g=>g.id===existingId?grant:g):[...gs,grant]);setInstallDialog(null);log('installed',`${config.tool} ${existingId?'更新了':'安装了'}「${nodeById(nodes,config.scopeId)?.title}」`,config.scopeId,`${config.permission==='read'?'只读':'读写'} · ${config.destination}`);notify('安装配置已保存 · 可查看分发预览')};
 const revoke=id=>{syncJobs.current.delete(id);setSyncing(a=>a.filter(x=>x!==id));const removed=grants.find(g=>g.id===id);setGrants(gs=>gs.filter(g=>g.id!==id));log('revoked',`撤销 ${removed.tool} 的此项授权`,removed.scopeId,'其他直接或继承授权仍独立生效');notify('已撤销此项安装，后续修改停止分发',()=>{setGrants(gs=>[...gs,removed]);setToast(null)})};
 const [moving,setMoving]=useState(false);
 const canMoveSource=id=>!NATIVE||(isRealId(id)&&memories.find(m=>m.id===id)?.importance!=='trivial');
 const canMoveHere=(id,targetId)=>canMove(nodes,id,targetId)&&canMoveSource(id)&&(!NATIVE||isRealId(targetId));
 const openMove=(id,targetId)=>{
  if(!canMoveSource(id)){
   notify('根、日记分组和按日期归档的琐事不支持在此移动。');return;
  }
  setMoveDialog({id,targetId:canMoveHere(id,targetId)?targetId:'',error:''});
 };
 const confirmMove=async()=>{
  if(moving||!moveDialog||!canMoveHere(moveDialog.id,moveDialog.targetId))return;
  const {id,targetId}=moveDialog;const original=nodeById(nodes,id);
  if(NATIVE){
   const childId=original?.memoryId||original?.id;
   if(!(original?.kind==='memory'&&isRealId(childId)&&isRealId(targetId))){
    notify('此位置不支持移动，请选择另一条记忆。');
    return;
   }
   setMoving(true);setMoveDialog(d=>({...d,error:''}));
   try{
    await attachMemory(childId,targetId);
    let moved={...memories.find(m=>m.id===childId),parentId:targetId};
    let refreshError='';
    try{moved=await readMemory(childId)}catch(e){refreshError=e.message||String(e)}
    paintNative(memories.map(m=>m.id===childId?moved:m));
    setExpanded(s=>new Set([...s,targetId]));setMoveDialog(null);
    log('moved',`移动了「${original.title}」`,id,`从 ${scopePath(nodes,original.parentId)} 到 ${scopePath(nodes,targetId)}`);
    notify(refreshError?'移动已完成，但刷新失败：'+refreshError+'。请重新打开记忆。':'节点已移动');
   }catch(e){setMoveDialog(d=>({...d,error:'移动失败：'+(e.message||e)}))}
   finally{setMoving(false)}
   return;
  }
  setNodes(ns=>moveNode(ns,id,targetId));setExpanded(s=>new Set([...s,targetId]));setMoveDialog(null);log('moved',`移动了「${original.title}」`,id,`从 ${scopePath(nodes,original.parentId)} 到 ${scopePath(nodes,targetId)}`);notify('节点已移动，继承权限已重新计算',()=>{setNodes(ns=>moveNode(ns,id,original.parentId));setToast(null)});
 };
 const deleteMutationBusy=useRef(false);
 const restoreDeleted=async ids=>{
  if(deleteMutationBusy.current)return;
  deleteMutationBusy.current=true;notify('正在撤销删除…');
  const failed=[];
  for(const id of ids){
   try{await restoreMemory(id)}catch(e){failed.push({id,error:e.message||String(e)})}
  }
  let refreshError='';
  try{
   const list=await bridgeBoot();
   if(!Array.isArray(list))throw new Error('记忆列表读取失败');
   paintNative(list);setSelected(ROOT_ID);await refreshNativeStatus();
  }catch(e){refreshError='；界面刷新失败，请重新打开客户端：'+(e.message||e)}
  deleteMutationBusy.current=false;
  const summary=`已恢复 ${ids.length-failed.length} 条记忆`;
  if(failed.length)notify(`${summary}，失败 ${failed.length} 条：${failed.map(f=>f.error).join('；')}${refreshError}`,()=>restoreDeleted(failed.map(f=>f.id)),'重试恢复');
  else notify(summary+refreshError);
 };
 const removeNode=async()=>{
  if(deleting||deleteMutationBusy.current) return;
  const node=deleteDialog;const ids=new Set(subtreeIds(nodes,node.id));
  if(!NATIVE){
   const removedNodes=nodes.filter(n=>ids.has(n.id));const removedMemories=memories.filter(m=>ids.has(m.id));const removedGrants=grants.filter(g=>ids.has(g.scopeId));removedGrants.forEach(g=>syncJobs.current.delete(g.id));setSyncing(a=>a.filter(id=>!removedGrants.some(g=>g.id===id)));setNodes(ns=>ns.filter(n=>!ids.has(n.id)));setMemories(ms=>ms.filter(m=>!ids.has(m.id)));setGrants(gs=>gs.filter(g=>!ids.has(g.scopeId)));setSelected(node.parentId||ROOT_ID);setDeleteDialog(null);log('deleted',`删除「${node.title}」及其后代`,node.parentId,'相关直接安装已撤销');notify('已删除节点与后代',()=>{setNodes(ns=>[...ns,...removedNodes]);setMemories(ms=>[...ms,...removedMemories]);setGrants(gs=>[...gs,...removedGrants]);setSelected(node.id);setToast(null)});
   return;
  }
  const memoryIds=[...new Set(nodes.filter(n=>ids.has(n.id)&&n.kind==='memory'&&isRealId(n.memoryId||n.id)).map(n=>n.memoryId||n.id))];
  deleteMutationBusy.current=true;setDeleting(true);
  const failed=[];const succeeded=new Set();
  for(const id of memoryIds){
   try{await deleteMemory(id);succeeded.add(id)}catch(e){failed.push({id,error:e.message||String(e)})}
  }
  const next=memories.filter(m=>!succeeded.has(m.id));
  paintNative(next);
  await refreshNativeStatus();
  setGrants(gs=>gs.filter(g=>!ids.has(g.scopeId)||!succeeded.has(g.scopeId)));
  setSelected(sel=>succeeded.has(sel)||ids.has(sel)?(node.parentId||ROOT_ID):sel);
  setDeleteDialog(null);
  log('deleted',`删除「${node.title}」`,node.parentId,failed.length?`成功 ${succeeded.size}，失败 ${failed.length}`:`成功 ${succeeded.size} 条`);
  const undo=succeeded.size?()=>restoreDeleted([...succeeded]):undefined;
  if(failed.length) notify(`已删除 ${succeeded.size} 条，失败 ${failed.length} 条：${failed.map(f=>f.error).join('；')}`,undo);
  else notify(memoryIds.length?`已删除 ${succeeded.size} 条记忆`:'没有可删除的记忆',undo);
  deleteMutationBusy.current=false;setDeleting(false);
 };
 const backup={format:'respire-tree',version:1,exportedAt:new Date().toISOString(),nodes,memories,installations:grants,activity};
 const shownBackup=backupSnapshot||backup;
 const openExport=async()=>{
  if(importBusy.current)return;
  if(exportPreview){setExportPreview(false);return}
  importBusy.current=true;setBackupBusy(true);setBackupResult('正在读取备份…');
  try{
   if(NATIVE&&!bridged)throw new Error('记忆库未接入');
   const list=NATIVE?await bridgeBoot():memories;
   if(!Array.isArray(list))throw new Error('记忆列表读取失败');
   setBackupSnapshot({...backup,exportedAt:new Date().toISOString(),memories:list,nodes:NATIVE?realTree(list):nodes});
   setExportPreview(true);setBackupResult(`已读取 ${list.length} 条记忆，可下载备份`);
  }catch(e){setBackupResult('导出失败：'+(e.message||String(e)))}
  finally{importBusy.current=false;setBackupBusy(false)}
 };
 const download=(value,name)=>{const link=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 const importBackup=async file=>{
  if(!file)return;
  if(importBusy.current)return;
  importBusy.current=true;setBackupBusy(true);setBackupResult('正在检查备份…');setExportPreview(false);
  try{
   const data=JSON.parse(await file.text());
   const {entries,ordered}=parseBackup(data);
   if(data.nodes&&(!Array.isArray(data.nodes)||!data.nodes.every(n=>n&&typeof n.id==='string'&&typeof n.title==='string'&&['tree','memory'].includes(n.kind))||new Set(data.nodes.map(n=>n.id)).size!==data.nodes.length))throw Error('树结构无效');
   if(NATIVE){
    if(!bridged)throw new Error('记忆库未接入');
    const byOld=new Map(entries.map(m=>[m.id,m]));
    const idMap=new Map();
    const created=[];
    let failed=0;let firstError='';
    const rootParent=isRealId(current.id)?current.id:undefined;
    const orphaned=entries.filter(m=>m.parentId&&!byOld.has(m.parentId)).length;
    for(const m of ordered){
     setBackupResult(`正在导入 ${created.length+failed+1}/${ordered.length} 条记忆…`);
     if(m.parentId&&byOld.has(m.parentId)&&!idMap.has(m.parentId)){
      failed++;
      if(!firstError)firstError='父节点创建失败';
      continue;
     }
     const parent=idMap.get(m.parentId)||rootParent;
     try{
      const saved=await createMemory({title:m.title,content:m.content,type:m.type,tags:Array.isArray(m.tags)?m.tags:[],parent,importance:m.importance});
      idMap.set(m.id,saved.id);
      created.push(saved);
     }catch(e){
      failed++;
      if(!firstError)firstError=e.message||String(e);
     }
    }
    let refreshError='';
    if(created.length){
     try{const list=await bridgeBoot();if(!Array.isArray(list))throw new Error('记忆列表读取失败');paintNative(list);await refreshNativeStatus()}
     catch(e){setMemories(previous=>[...previous,...created.filter(s=>!previous.some(m=>m.id===s.id))]);refreshError='；列表刷新失败，请重新打开客户端：'+(e.message||String(e))}
     const last=created[created.length-1];
     setExpanded(e=>new Set([...e,current.id,last.id]));
     setSelected(last.id);
    }
    log('imported','导入了记忆树',current.id,`成功 ${created.length}，失败 ${failed}`);
    const result=(failed?`已导入 ${created.length} 条，失败 ${failed} 条：${firstError}。重导整个文件会重复创建成功条目`:`已导入 ${created.length} 条记忆`)+(orphaned?`；${orphaned} 条记忆的原父节点不在备份中，按顶层追加`:'')+refreshError;
    setBackupResult(result);notify(result);
    return;
   }
   const prefix=makeNodeId();const ids=new Map(entries.map(m=>[m.id,prefix+'-'+m.id]));const incoming=entries.map(m=>({...m,id:ids.get(m.id),tags:Array.isArray(m.tags)?m.tags:[],parentId:ids.get(m.parentId)||null,relatedIds:(Array.isArray(m.relatedIds)?m.relatedIds:[]).map(id=>ids.get(id)).filter(Boolean)}));const group={id:prefix,parentId:current.id,title:'导入的记忆树',kind:'tree'};let importedNodes;if(Array.isArray(data.nodes)&&data.nodes.some(n=>n.id===ROOT_ID)){const nodeIds=new Map(data.nodes.map(n=>[n.id,n.id===ROOT_ID?prefix:ids.get(n.id)||prefix+'-'+n.id]));importedNodes=data.nodes.filter(n=>n.id!==ROOT_ID).map(n=>({...n,id:nodeIds.get(n.id),parentId:nodeIds.get(n.parentId)||prefix,...(n.memoryId?{memoryId:ids.get(n.memoryId)}:{})})).filter(n=>n.kind==='tree'||n.memoryId);for(const n of importedNodes){const seen=new Set([n.id]);let parent=n.parentId;while(parent!==prefix){if(seen.has(parent)){n.parentId=prefix;break}seen.add(parent);parent=importedNodes.find(x=>x.id===parent)?.parentId||prefix}}const placed=new Set(importedNodes.map(n=>n.memoryId));importedNodes.push(...incoming.filter(m=>!placed.has(m.id)).map(m=>({id:m.id,memoryId:m.id,parentId:prefix,title:m.title,kind:'memory'})))}else{importedNodes=incoming.map(m=>({id:m.id,memoryId:m.id,parentId:prefix,title:m.title,kind:'memory'}))}setMemories(ms=>[...ms,...incoming]);setNodes(ns=>[...ns,group,...importedNodes]);setExpanded(e=>new Set([...e,current.id,prefix]));setSelected(prefix);log('imported','导入了记忆树',prefix,`${incoming.length} 条记忆 · 外部安装需重新选择`);setBackupResult(`已导入 ${incoming.length} 条记忆；安装授权不自动恢复`);notify(`已导入 ${incoming.length} 条记忆；安装授权不自动恢复`);
  }catch(e){const message='导入失败：'+(e.message||String(e));setBackupResult(message);notify(message)}
  finally{importBusy.current=false;setBackupBusy(false);if(fileInput.current)fileInput.current.value=''}
 };
 const currentIds=new Set(subtreeIds(nodes,current?.id));const scopedActivity=activity.filter(a=>currentIds.has(a.nodeId));
 const contentById=useMemo(()=>new Map(memories.map(m=>[m.id,m.content||''])),[memories]);
 const contentSlim=useMemo(()=>new Map(memories.map(m=>[m.id,(m.content||'').slice(0,2000)])),[memories]);
 const deferredSearch=useDeferredValue(search);
 const searchResults=useMemo(()=>{
   const q=deferredSearch.trim().toLowerCase();
   const idx=nodes.map(n=>({n, hay:`${n.title} ${contentSlim.get(n.memoryId)||''}`.toLowerCase()}));
   return q?idx.filter(x=>x.hay.includes(q)).map(x=>x.n):idx.slice(0,50).map(x=>x.n);
 },[nodes,contentSlim,deferredSearch]);
 return <div className={'app tw-app '+(!inspector?'inspector-hidden':'')}>
  <aside className={'sidebar '+(mobileSide?'mobile-open':'')}>
   <div className="mac-controls" aria-hidden="true"><i/><i/><i/></div>
   <div className="brand-row"><img src={theme==='dark'?logoLight:logoDark} alt="Respire"/><span className="desktop-label">Respire · 本地记忆库</span></div>
   <button className="workspace-switch" onClick={()=>setPreferences(true)}><span className="avatar">{(userLabel||'本').slice(0,1)}</span><span><strong>{userLabel||'本机'}</strong><small>个人工作区</small></span><span className="tw-plan">LOCAL</span></button>
   <button className="side-search tw-search" onClick={()=>setSearchOpen(true)}><MagnifyingGlass size={16}/><span>{NATIVE?'搜索记忆':'搜索名称、路径与内容'}</span><kbd>⌘ K</kbd></button>
   <div className="tw-tree-heading"><span>MEMORY TREE</span><div className="tw-new-wrap"><IconButton label="添加节点" onClick={()=>setNewMenu(!newMenu)}><Plus size={16}/></IconButton>{newMenu&&<div className="action-menu"><button onClick={()=>startNew('memory')}><FileText size={15}/>新建记忆<kbd>⌘ N</kbd></button><button onClick={()=>startNew('tree')}><Folder size={15}/>新建子树<kbd>⇧ ⌘ N</kbd></button></div>}</div></div>
   <TreeSidebar nodes={nodes} selectedId={current?.id} expanded={expanded} onToggle={id=>setExpanded(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next})} onSelect={id=>{select(id);setView('tree')}} onMove={(id,targetId)=>canMoveHere(id,targetId)&&openMove(id,targetId)} onNew={startNew} onRename={editNode} onDelete={node=>node.id!==ROOT_ID&&setDeleteDialog(node)} installations={enriched} onContextNode={(node,event)=>setCtxMenu({x:event.clientX,y:event.clientY,node})}/>
   <div className="tw-sidebar-bottom"><button onClick={()=>setPage('sync')}><CloudCheck size={15}/><span>{bridged?(statusInfo?.offline?'离线本机 · 不同步云端':(cloudAuthed(statusInfo)?(syncBusy?'正在同步…':'云端已连接 · 可同步'):'云端未接 · 登录后同步')):(enriched.some(g=>g.pending)?`${enriched.filter(g=>g.pending).length} 个目标待更新`:'云端同步 · 本机一致')}</span><span className={'status-dot '+(bridged?(cloudAuthed(statusInfo)?'': 'pending'):(enriched.some(g=>g.pending)?'pending':''))}/></button><div><span>{memories.length} 条记忆</span><button title="快捷键" aria-label="快捷键" onClick={()=>setHelp(true)}><Command size={13}/></button></div></div>
   <nav className="dock" aria-label="核心导航">{[['tree',TreeStructure,'记忆树'],['sync',ArrowsClockwise,'同步'],['install',PlugsConnected,'注入'],['cure',Sparkle,'治理']].map(([id,I,label])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setMobileSide(false)}}><I size={20}/><span>{label}</span></button>)}</nav>
  </aside>
  <div className="workspace">
   {NATIVE&&<div className="tw-refresh-status" role="status"><span>{refreshError||'记忆自动刷新已启用'}</span><button className="text-link" disabled={!!editor||saving||deleting||syncBusy||backupBusy} onClick={()=>doBoot(true)}><ArrowClockwise size={14}/>手动刷新</button></div>}
   <header className="topbar tw-topbar"><div className="breadcrumbs"><IconButton label="切换侧栏" onClick={()=>setMobileSide(!mobileSide)}><SidebarSimple size={19}/></IconButton><span className="tw-workspace-label">{(userLabel||'本机')+" 的工作区"}</span><CaretRight size={12}/><strong>{page==='tree'?'记忆树':page==='sync'?'云端同步':page==='cure'?'树况治理':'注入到 AI'}</strong></div><span className="tw-local-badge" title={bridged?(statusInfo?.data_dir||'~/.respire'):undefined}><span className="status-dot"/><span className="tw-local-badge-text">{bridged?(statusInfo?.offline?'离线本机（仅此电脑）':`已连接（${statusInfo?.data_dir||'~/.respire'}）`):"未接入"}</span></span><IconButton label="外观与数据" onClick={()=>setPreferences(true)}><span className="small-avatar">{(userLabel||"本").slice(0,1)}</span></IconButton></header>
   <div className="tw-location"><div className="tw-breadcrumb-path" aria-label="当前节点路径">{path.map((node,i)=><React.Fragment key={node.id}>{i>0&&<CaretRight size={11}/>}<button title={node.title} onClick={()=>select(node.id)} className={i===path.length-1?'current':''}>{i===0&&<TreeStructure size={14}/>}<span>{node.title}</span></button></React.Fragment>)}</div></div>
   {page==='tree'?<div className="memory-workspace"><main className="main-pane"><div className="content-toolbar"><div className="view-tabs">{[['tree',TreeStructure,'Tree'],['activity',Clock,'Activity'],['graph',Link,'Graph']].map(([id,I,label])=><button key={id} className={view===id?'active':''} aria-pressed={view===id} onClick={()=>setView(id)}><I size={14}/>{label}</button>)}</div><div className="toolbar-actions"><span className="saved-label" role="status"><Check size={12}/>{readingMemory?'正在读取记忆…':'本机已保存'}</span><IconButton label="切换作用域检查器" onClick={()=>setInspector(!inspector)}><SidebarSimple size={18} style={{transform:'rotate(180deg)'}}/></IconButton></div></div>
    <div className="content-scroll tw-content" key={current.id+'-'+view}>
    {view==='graph'?<><div className="tw-auxiliary-note"><Info size={14}/>关系图用于理解关联，不改变树层级与安装权限。</div><MemoryGraph memories={scope} selected={memory?.id||scope[0]?.id} onSelect={id=>{select(id);setView('tree')}} native={NATIVE}/></>:view==='activity'?<section className="tw-activity"><div className="tw-section-kicker">ACTIVITY · 当前子树</div><h1>每一次修改，都有来路。</h1><p className="tw-subtitle">{scopePath(nodes,current.id)}</p><div className="tw-activity-list">{scopedActivity.map(item=><div key={item.id}><span className={'tw-activity-dot '+item.kind}>{item.kind==='synced'?<ArrowsClockwise size={13}/>:item.kind==='installed'?<PlugsConnected size={13}/>:<PencilSimple size={13}/>}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{new Date(item.at).toLocaleDateString('zh-CN')} · {timeLabel(item.at)}</small></div>{nodeById(nodes,item.nodeId)&&<button aria-label={'定位'+item.title} onClick={()=>select(item.nodeId)}><ArrowUpRight size={14}/></button>}</div>)}{!scopedActivity.length&&<div className="tw-empty"><Clock size={26}/><p>此子树还没有新的动态</p><small>修改、安装与同步会记录在这里。</small></div>}</div></section>:<>
     <section className="tw-node-heading"><div className="tw-node-eyebrow">{current.kind==='tree'?<Folder size={17}/>:<FileText size={17}/>}<span>{current.kind==='tree'?'MEMORY TREE':typeInfo[memory?.type]?.label||'记忆'}</span>{current.id===ROOT_ID&&<small>ROOT</small>}</div><div className="tw-title-row"><h1>{current.title}</h1><div className="more-wrap"><IconButton label="节点操作" onClick={()=>setMoreMenu(!moreMenu)}><DotsThree size={22}/></IconButton>{moreMenu&&<div className="action-menu"><button onClick={()=>editNode(current)}><PencilSimple size={15}/>{memory?'编辑记忆':'重命名'}<kbd>F2</kbd></button><button onClick={async()=>{setMoreMenu(false);try{const m=await inv('book_material',{root:current.id});await copyText(JSON.stringify(m,null,1));notify(`成书材料已复制（${m.total_entries} 条 · ${m.total_chars} 字）`)}catch(e){notify('成书失败：'+e)}}}><BookOpen size={15}/>导出成书材料</button><button onClick={async()=>{setMoreMenu(false);try{const m=await inv('portrait_material',{limit:40});await copyText(JSON.stringify(m,null,1));notify('画像材料已复制')}catch(e){notify('画像失败：'+e)}}}><Sparkle size={15}/>导出画像材料</button><button onClick={()=>{setInstallDialog({scopeId:current.id});setMoreMenu(false)}}><PlugsConnected size={15}/>安装此子树</button><button onClick={()=>{setShareDialog({scopeId:current.id});setMoreMenu(false)}}><Copy size={15}/>分享此子树</button>{current.id!==ROOT_ID&&canMoveSource(current.id)&&<button onClick={()=>{openMove(current.id,current.parentId);setMoreMenu(false)}}><ArrowRight size={15}/>移动到…</button>}{current.id!==ROOT_ID&&<button className="danger" onClick={()=>{setDeleteDialog(current);setMoreMenu(false)}}><Trash size={15}/>删除节点与后代</button>}</div>}</div></div>{!memory&&<p className="tw-subtitle">{current.id===DIARY_ID?'每日琐事与活动轨迹，按天归档——点下方日历的日期，弹出当天记录。':current.id===ROOT_ID?'全部记忆之根——分类树与日记本皆在其下。':'组织背景、偏好与决策，供各工具取用。'}</p>}<div className="tw-node-metadata"><span>{scope.length} 条记忆</span><i>·</i><span>{children.length} {current.id===DIARY_ID?'天':'个直接子节点'}</span>{memory&&<><i>·</i><span>来自 {memory.source}</span></>}</div></section>
     <div className="tw-scope-bar"><div><ShieldCheck size={15}/><span>当前 Scope</span><strong>{current.title}</strong><small>包含全部后代</small></div></div>
     {current.id===DIARY_ID?<DiaryCalendar days={diaryDays} onOpenDay={day=>{setDiaryDetail(null);setDiaryDay(day)}}/>:(children.length>0||current.kind==='tree')&&<section className="tw-node-list"><header><span>子节点 <small>{children.length}</small></span><button onClick={()=>startNew('memory')}><Plus size={13}/>添加记忆</button></header><div className="tw-table-head"><span>名称</span><span>范围</span><span>AI 访问</span><span/></div>{children.map(node=>{const count=memoriesInScope(nodes,memories,node.id).length;const targets=enriched.filter(g=>subtreeIds(nodes,g.scopeId).includes(node.id)||subtreeIds(nodes,node.id).includes(g.scopeId));return <button className="tw-node-table-row" key={node.id} onClick={()=>select(node.id)}><span>{node.kind==='tree'?<Folder size={17}/>:<FileText size={17}/>}<span><strong>{node.title}</strong><small>{node.kind==='tree'?'子树':typeInfo[memories.find(m=>m.id===node.memoryId)?.type]?.label||'记忆'}</small></span></span><span>{count} 条</span><span>{targets.length?targets.map(g=><i title={g.tool+' · '+(!subtreeIds(nodes,g.scopeId).includes(node.id)?'仅部分子树 · ':'')+(g.permission==='read'?'只读':'读写')} key={g.id}>{tools.find(t=>t.name===g.tool)?.mark||'⌘'}{!subtreeIds(nodes,g.scopeId).includes(node.id)&&<em>部分</em>}</i>):<small>仅自己</small>}</span><CaretRight size={13}/></button>})}{!children.length&&<div className="tw-empty"><Folder size={27}/><p>这棵子树还没有内容</p><button onClick={()=>startNew('memory')}>添加第一条记忆<Plus size={13}/></button></div>}</section>}
     {memory&&<article className="tw-memory-body"><header><span>记忆内容</span><button onClick={()=>editNode(current)}><PencilSimple size={14}/>编辑</button></header><ReadingContent content={memory.content}/>{memory.tags?.length>0&&<div className="tw-tags">{memory.tags.map(tag=><span key={tag}># {tag}</span>)}</div>}<footer><span>更新于 {new Date(memory.updatedAt).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><button onClick={()=>startNew('memory')}><Plus size={13}/>添加子记忆</button></footer></article>}
     <div className="tw-content-footnote"><LockSimple size={13}/>未安装到外部目标的内容，仅留在你的记忆树中。</div>
    </>}
    </div>
    <footer className="tw-main-footer"><span><TreeStructure size={14}/>{current.kind==='tree'?'Tree':'Memory'} · {current.id===ROOT_ID?'根节点':'可寻址节点'}</span><button onClick={()=>setHelp(true)}>快捷键<kbd>⌘</kbd></button></footer>
   </main>
   {inspector&&<aside className="inspector tw-inspector"><div className="inspector-heading"><span>Scope & Access</span><IconButton label="收起作用域检查器" onClick={()=>setInspector(false)}><X size={16}/></IconButton></div><section className="tw-inspector-scope"><div className="tw-inspector-symbol">{current.kind==='tree'?<TreeStructure size={25}/>:<FileText size={25}/>}</div><h3>{current.title}</h3><p>{scope.length} 条记忆 · 包含全部后代</p><div className="tw-property"><span>所有者</span><strong>{(userLabel||'本机')+" · 你"}</strong></div><div className="tw-property"><span>本机状态</span><strong className="tw-green"><Check size={12}/>已保存</strong></div><div className="tw-property"><span>节点 ID</span><button title="复制稳定节点 ID" onClick={()=>copy(current.id)}>{current.id.length>17?current.id.slice(0,15)+'…':current.id}<Copy size={11}/></button></div></section><section className="tw-access-section"><div className="tw-inspector-label"><span>哪些 AI 能看到</span><ShieldCheck size={14}/></div>{coveredTargets.map(g=>{const inherited=g.scopeId!==current.id&&subtreeIds(nodes,g.scopeId).includes(current.id);const partial=!subtreeIds(nodes,g.scopeId).includes(current.id);return <div className="tw-access-row" key={g.id}><div className="tw-tool-symbol">{tools.find(t=>t.name===g.tool)?.mark||'⌘'}</div><div><strong>{g.tool}<span>{g.permission==='read'?'只读':'读写'}</span></strong><button className="tw-inherited" onClick={()=>select(g.scopeId)}>{inherited?'继承自':partial?'仅包含':'直接安装'} {inherited||partial?nodeById(nodes,g.scopeId)?.title:''}{(inherited||partial)&&<ArrowUpRight size={10}/>}</button><small className={g.pending?'tw-amber':''}>{syncing.includes(g.id)?'正在同步…':g.pending?'有修改待更新到目标':'已与目标一致'}</small></div></div>})}{!coveredTargets.length&&<div className="tw-private"><LockSimple size={19}/><strong>仅自己可见</strong><p>尚未为此范围配置外部访问。</p></div>}{enriched.filter(g=>!coveredTargets.some(t=>t.id===g.id)&&g.pending&&g.appliedIds?.some(id=>currentIds.has(id))).map(g=><div key={g.id} className="tw-retract"><Info size={14}/><span>{g.tool} 待撤回旧版本，完成同步后移除访问。</span><button onClick={()=>refresh([g.id])}>同步</button></div>)}<button className="tw-install-link" onClick={()=>setInstallDialog({scopeId:current.id})}><Plus size={14}/>安装到 AI 或 App</button></section><section className="tw-access-section"><div className="tw-inspector-label"><span>修改之后，同步到哪里</span><ArrowsClockwise size={14}/></div><div className="tw-sync-path"><div><i className="status-dot"/><strong>本机记忆树</strong><span>已保存</span></div><div><i className={'status-dot '+(bridged&&!cloudAuthed(statusInfo)?'pending':'')}/><strong>云端副本</strong><span>{bridged?(cloudAuthed(statusInfo)?(statusInfo?.session?.user?'已连接 · '+statusInfo.session.user:'已连接'):'未连接'):'演示'}</span></div>{coveredTargets.map(g=><div key={g.id}><i className={'status-dot '+(g.pending?'pending':'')}/><strong>{g.tool}</strong><span>{g.syncMode==='auto'?(autoSync?'自动同步':'已暂停'):'手动更新'}</span></div>)}</div><button className="text-link" onClick={()=>setPage('sync')}>查看同步状态<ArrowUpRight size={13}/></button></section><div className="tw-inspector-tip"><Info size={14}/><p>授权跟随子树，新增后代继承。</p></div></aside>}
   </div>:<main className="tw-settings-main">{page==='install'?<InstallView nodes={nodes} memories={memories} installations={enriched} selectedId={current.id} onInstall={()=>setInstallDialog({scopeId:current.id})} onConfigure={g=>setInstallDialog({scopeId:g.scopeId,existing:g})} onRevoke={revoke} onRefresh={id=>refresh([id])}/>:page==='cure'?<main className="tw-settings-main"><CurePage notify={notify} inv={inv}/></main>:page==='sync'?<SyncView nodes={nodes} memories={memories} installations={enriched} autoSync={autoSync} onAutoSync={v=>{setAutoSync(v);inv('sync_config_set',{autosync:v}).catch(()=>{})}} lastSavedAt={lastSavedAt} statusInfo={statusInfo} onCloudSync={runCloudSync} cloudBusy={syncBusy} syncResult={syncResult} syncFailed={syncFailed} statusCountsError={statusCountsError} onOpenGate={()=>setShowGate(true)}/>:<InstallView nodes={nodes} memories={memories} selectedId={current.id} onInstall={()=>setInstallDialog({scopeId:current.id})}/>}</main>}
  </div>
  {mobileSide&&<button className="sidebar-scrim" aria-label="收起侧栏" onClick={()=>setMobileSide(false)}/>}
  {editor&&<Editor node={editor.node} memory={memories.find(m=>m.id===editor.node.memoryId||m.id===editor.node.id)} parentPath={scopePath(nodes,editor.parentId)} onClose={()=>{if(!saving)setEditor(null)}} onSave={saveNode} saving={saving} error={editor.error||''}/>}
  {installDialog&&<InstallDialog scopeId={installDialog.scopeId} existing={installDialog.existing} nodes={nodes} memories={memories} onClose={()=>setInstallDialog(null)} onSave={saveInstall} bridged={bridged} notify={notify}/>}
  {shareDialog&&<ShareDialog scopeId={shareDialog.scopeId} nodes={nodes} memories={memories} onClose={()=>setShareDialog(null)} notify={notify}/>}
  {moveDialog&&<Modal title={NATIVE?'移动记忆子树':'移动子树 · 确认作用域变化'} onClose={()=>{if(!moving)setMoveDialog(null)}} wide>
   <p className="muted">移动「{nodeById(nodes,moveDialog.id)?.title}」及其所有后代</p>
   <label className="tw-move-destination">目标节点<select aria-label="选择移动目标" disabled={moving} value={moveDialog.targetId} onChange={e=>setMoveDialog({...moveDialog,targetId:e.target.value,error:''})}>
    <option value="">请选择目标节点</option>
    {nodes.filter(n=>canMoveHere(moveDialog.id,n.id)).map(n=><option key={n.id} value={n.id}>{scopePath(nodes,n.id)}</option>)}
   </select></label>
   <div className="tw-move-path"><span>{scopePath(nodes,moveDialog.id)}</span><ArrowDownMarker/><strong>{moveDialog.targetId?scopePath(nodes,moveDialog.targetId):'尚未选择目标'}</strong></div>
   {!NATIVE&&<div className="tw-move-impact">{moveImpact(nodes,moveNode(nodes,moveDialog.id,moveDialog.targetId),enriched,moveDialog.id).map(({grant,added,removed})=><div key={grant.id}><span>{grant.tool}</span><strong className={added.length?'tw-amber':'tw-muted'}>{added.length?'增加访问':'移出访问范围'}</strong><small>{grant.syncMode==='auto'?'自动同步后生效':'手动更新目标后生效'}</small></div>)}{!moveImpact(nodes,moveNode(nodes,moveDialog.id,moveDialog.targetId),enriched,moveDialog.id).length&&<p><ShieldCheck size={15}/>当前 AI 访问权限不变</p>}</div>}
   <p className="tw-demo-note">{NATIVE?'移动到另一条记忆；ID 与正文不变。':'安装跟随节点 ID；移动可撤销。'}</p>
   {moveDialog.error&&<p role="alert">{moveDialog.error}</p>}
   <footer className="modal-footer"><button className="button" disabled={moving} onClick={()=>setMoveDialog(null)}>取消</button><button className="button primary" disabled={moving||!canMoveHere(moveDialog.id,moveDialog.targetId)||moveDialog.targetId===nodeById(nodes,moveDialog.id)?.parentId} onClick={confirmMove}>{moving?'正在移动…':'移动到这里'}</button></footer>
  </Modal>}
  {deleteDialog&&<Modal title="删除节点及其后代？" onClose={()=>{if(!deleting)setDeleteDialog(null)}}><p className="muted">「{deleteDialog.title}」中的 {memoriesInScope(nodes,memories,deleteDialog.id).length} 条记忆将被移除，绑定此范围的直接安装也会撤销。{NATIVE?'30 秒内可撤销；不恢复外部授权。':'删除后可撤销。'}</p><footer className="modal-footer"><button className="button" onClick={()=>setDeleteDialog(null)} disabled={deleting}>取消</button><button className="button danger-fill" onClick={removeNode} disabled={deleting}>{deleting?'删除中…':'删除节点'}</button></footer></Modal>}
  {searchOpen&&(NATIVE?<NativeMemorySearch onClose={()=>{selectionRequest.current++;setReadingMemory(false);setSearchOpen(false)}} onSelect={async(id,onError)=>{const opened=await select(id,onError);if(opened)setView('tree');return opened}}/>:<Modal title="定位一段记忆" onClose={()=>setSearchOpen(false)} wide><div className="search-modal-input"><MagnifyingGlass size={20}/><input autoFocus aria-label="搜索节点" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索名称、完整路径或记忆内容…" onKeyDown={e=>{if(e.key==='Enter'&&searchResults[0]){select(searchResults[0].id);setSearchOpen(false);setView('tree')}}}/></div><div className="search-results">{searchResults.map(n=><button key={n.id} onClick={()=>{select(n.id);setSearchOpen(false);setView('tree')}}>{n.kind==='tree'?<Folder size={18}/>:<FileText size={18}/>}<div><strong>{n.title}</strong><p>{scopePath(nodes,n.id)}</p></div><ArrowUpRight size={14}/></button>)}{!searchResults.length&&<div className="tw-empty"><p>没有匹配的节点</p><small>试试更短的名称或路径。</small></div>}</div></Modal>)}
  {diaryDay&&<Modal title={diaryDetail?diaryDetail.title||'日记详情':`${diaryDay} · 当天记录`} wide onClose={()=>{setDiaryDay(null);setDiaryDetail(null)}}>
   {diaryDetail
    ?<div className="tw-diary-entry">
      <p className="tw-demo-note">{typeInfo[diaryDetail.type]?.label||'琐事'}{diaryDetail.createdAt?` · ${new Date(diaryDetail.createdAt).toLocaleString('zh-CN')}`:''}</p>
      <div className="tw-diary-entry-body">{diaryDetail.content||'（无正文）'}</div>
      <footer className="modal-footer"><button className="button" onClick={()=>setDiaryDetail(null)}>返回当天列表</button></footer>
     </div>
    :<div className="tw-diary-detail">
      <div className="tw-diary-items">
       {((diaryDays.find(d=>d.day===diaryDay)||{}).items||[]).map(item=><button key={item.id} type="button" disabled={diaryLoading} onClick={()=>openDiaryEntry(item.id)}>
         <Article size={15} />
         <span>{item.title}</span>
         <CaretRight size={13} />
        </button>)}
       {!((diaryDays.find(d=>d.day===diaryDay)||{}).items||[]).length && <div className="tw-empty"><CalendarBlank size={24} /><p>这一天没有记录</p></div>}
      </div>
     </div>}
  </Modal>}
  {preferences&&<Modal title="工作区设置" onClose={()=>{setPreferences(false);setExportPreview(false);recoveryRequest.current++;setRecoveryText('')}} wide><div className="tw-tabs" role="tablist"><button role="tab" aria-selected={prefTab==='data'} className={"tw-tab"+(prefTab==='data'?" active":"")} onClick={()=>setPrefTab("data")}>数据</button><button role="tab" aria-selected={prefTab==='sync'} className={"tw-tab"+(prefTab==='sync'?" active":"")} onClick={()=>setPrefTab("sync")}>同步与账号</button><button role="tab" aria-selected={prefTab==='look'} className={"tw-tab"+(prefTab==='look'?" active":"")} onClick={()=>setPrefTab("look")}>外观</button><button role="tab" aria-selected={prefTab==='adv'} className={"tw-tab"+(prefTab==='adv'?" active":"")} onClick={()=>setPrefTab("adv")}>高级</button></div>{prefTab==="data"&&<>{bridged&&<><div className="tw-preference-row" title={`${memories.length} 条记忆 · 铁律注入 ${injectStat.fresh}/${injectStat.total} 应用`}><div><strong>{(userLabel||'本机')+" 的个人工作区"}</strong></div><span className="avatar">{(userLabel||"本").slice(0,1)}</span></div><div className="tw-pref-group">空间</div>{bridged&&<WorkspaceConfig notify={notify} onOpenGate={()=>setShowGate(true)} bridged={bridged} statusInfo={statusInfo} onSessionChange={doBoot} section="data"/>}<div className="tw-pref-group">备份与导入导出</div><div className="tw-preference-row" title="复制当前加密库到尚不存在的新文件，不会覆盖已有路径。恢复时用全新空数据目录，不要覆盖当前库。只复制数据库不够，还必须用同一把超级密码才能解密。"><div><strong>数据库快照</strong></div><div className="tw-pref-ctrl"><button className="button" disabled={backupBusy} onClick={runBackupDb}><DownloadSimple size={15}/>选择位置并保存快照</button></div></div>
  <div className="tw-preference-row" title="导出或追加导入明文记忆。这是追加，不是完整库还原，也不是数据库快照。"><div><strong>记忆 JSON</strong></div><div className="tw-pref-ctrl"><button className="button" disabled={backupBusy} onClick={runExportMemoriesFile}>选择位置并导出</button><button className="button" disabled={backupBusy} onClick={runImportMemoriesFile}>选择文件并追加导入</button></div></div></>}
  {backupResult&&<p role="status" aria-live="polite">{backupResult}</p>}
  <div className="tw-preference-row" title="层级、记忆、安装配置与修改记录"><div><strong>导出完整记忆树</strong></div><button className="button" disabled={backupBusy} onClick={openExport}><DownloadSimple size={15}/>导出</button></div>{exportPreview&&<><textarea className="tw-export-preview" aria-label="完整备份 JSON" readOnly rows={7} value={JSON.stringify(shownBackup,null,2)}/><div className="tw-export-actions"><button className="button" onClick={()=>copy(JSON.stringify(shownBackup,null,2))}>复制 JSON</button><button className="button primary" onClick={()=>download(shownBackup,'respire-tree-backup.json')}>下载备份</button></div></>}<div className="tw-preference-row" title={NATIVE?'追加副本到当前节点；生成新 ID 和时间，保留正文、类型、标签和父子关系；外部授权需重新选择。这不是完整库还原。':'追加到当前节点；外部授权需重新选择。这不是完整库还原。'}><div><strong>导入记忆树（JSON 追加）</strong></div><button className="button" disabled={backupBusy} onClick={()=>fileInput.current?.click()}><UploadSimple size={15}/>{backupBusy?'处理中…':'导入'}</button><input type="file" ref={fileInput} accept=".json,application/json" style={{display:'none'}} onChange={e=>importBackup(e.target.files?.[0])}/></div>
  {bridged&&<></>}</>}{prefTab==="sync"&&<><div className="tw-pref-group">账号</div>{!bridged&&window.__TAURI__?.core?.invoke&&<div className="tw-preference-row" title="注册 / 登录 / 离线本机"><div><strong>记忆库未接入</strong></div><button className="button primary" onClick={()=>setShowGate(true)}>接入</button></div>}
  {bridged&&<><div className="tw-preference-row" title="写入 dsh / opencode / codex 等已检测 AI 软件的提示词"><div><strong>记忆注入（14 目标）</strong></div><button className="button" onClick={async()=>{try{const r=await inv('inject');notify('已注入全部已检测目标')}catch(e){notify('注入失败：'+e)}}}><PlugsConnected size={15}/>全部注入</button></div>
  <div className="tw-preference-row" title="拉云端增量，推本地新改（LWW）；失败可重试"><div><strong>云同步对账</strong></div><button className="button" disabled={syncBusy} onClick={()=>runCloudSync()}><ArrowsClockwise size={15}/>{syncBusy?'同步中…':(syncFailed?'重试同步':'立即同步')}</button></div>
  {bridged&&<WorkspaceConfig notify={notify} onOpenGate={()=>setShowGate(true)} bridged={bridged} statusInfo={statusInfo} onSessionChange={doBoot} section="sync"/>}</>}</>}{prefTab==="look"&&<><div className="tw-pref-group">界面</div><div className="tw-preference-row"><strong>主题</strong><div className="view-tabs"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun size={15}/>浅色</button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon size={15}/>深色</button></div></div>
  <FontPanel look={look} patch={patchLook} notify={notify}/></>}{prefTab==="adv"&&<>{bridged&&<><WorkspaceModeRow inv={inv} notify={notify}/><div className="tw-pref-group">应用</div><div className="tw-preference-row" title="连 npm registry 查 CLI 有无新版（每次点击实时出网）"><div><strong>检查更新</strong><span>{updInfo?(updInfo.outdated?`有新版 ${updInfo.latest}——当前 ${updInfo.current}，终端 npm i -g @rsrsai/cli 升级`:(updInfo.outdated===false?`已是最新（${updInfo.current}）`:'未查到（离线或 registry 不可达）')):(statusInfo?.version?('当前版本 '+statusInfo.version):'点击检查')}</span></div><button className="button" disabled={updBusy} onClick={async()=>{setUpdBusy(true);try{const r=await inv('update_check',{});setUpdInfo(r)}catch(e){notify('检查失败：'+errText(e))}setUpdBusy(false)}}>{updBusy?'检查中…':'检查更新'}</button></div><div className="tw-pref-group">记忆维护</div><div className="tw-preference-row" title="逐条记录每条琐事（记忆增长快，需定期梳理）；关则一天一条活动轨迹"><div><strong>琐事详记</strong></div><button className={'tw-switch '+(diaryVerbose?'on':'')} type="button" role="switch" aria-checked={diaryVerbose} aria-label="琐事详记" disabled={diaryBusy} onClick={toggleDiary}><i/></button></div><div className="tw-preference-row" title="用当前嵌入模型重建全部条目向量（千余条约 1–2 分钟，期间库锁串行）；批量改写条目后使用"><div><strong>重算向量</strong></div><button className="button" disabled={reembedBusy} onClick={async()=>{if(!confirm('重算全部向量？千余条约 1–2 分钟，期间其他记忆命令会排队等待。'))return;setReembedBusy(true);try{const r=await inv('reembed');notify(`已重算 ${r.reembedded} 条向量（${r.dims} 维），随后自动同步`);runCloudSync()}catch(e){notify('重算失败：'+e)}setReembedBusy(false)}}><ArrowClockwise size={15}/>{reembedBusy?'重算中…':'开始重算'}</button></div>
  <div className="tw-preference-row" title="相似簇 / 孤叶 / 树况账单（只读）"><div><strong>整理分析</strong></div><button className="button" onClick={async()=>{try{const r=await inv('defrag',{min:0.6,top:10});const lines=(r.clusters||[]).slice(0,5).map(c=>c.members.map(m=>m.title).join(' / ')).join('\n');notify(`根 ${r.roots}，孤叶 ${r.orphans}，簇 ${r.clusters.length}${lines?'\n'+lines:''}`)}catch(e){notify('整理失败：'+e)}}}><Sparkle size={15}/>分析</button></div>
  <div className="tw-preference-row" title="导出成书或画像材料，交给 AI 拟稿"><div><strong>成书 / 画像</strong></div><button className="button" onClick={async()=>{try{const m=await inv('portrait_material',{limit:40});await copyText(JSON.stringify(m,null,1));notify('画像材料已复制到剪贴板')}catch(e){notify('画像失败：'+e)}}}><Info size={15}/>画像材料</button></div>
  <div className="tw-preference-row" title="后台每 10 分钟把散记挂到相近主题树下"><div><strong>定期自动归纲</strong></div><button className="button" onClick={async()=>{try{const r=await inv('tree_cure',{top:60});let ok=0;for(const s of r.suggests){try{await inv('attach',{id:s.orphan.id,parent:s.target.id});ok++}catch{}}notify(`本轮归纲 ${ok} 条`)}catch(e){notify('归纲失败：'+e)}}}><TreeStructure size={15}/>立即归纲</button></div>{bridged&&<WorkspaceConfig notify={notify} onOpenGate={()=>setShowGate(true)} bridged={bridged} statusInfo={statusInfo} onSessionChange={doBoot} section="adv"/>}</>}</>}<p className="tw-demo-note">{bridged?`已连接本地记忆库（${statusInfo?.data_dir||'~/.respire'}），修改实时保存到本机。`:'浏览器演示：未连接真实服务。'}</p></Modal>}
  {showGate&&<AccountGate notify={notify} bootError={bootError} onDone={async()=>{setShowGate(false);await doBoot()}}/>}
  {help&&<Modal title="为键盘而设计" onClose={()=>setHelp(false)}><div className="shortcut-list"><div>搜索并定位节点<kbd>⌘ K</kbd></div><div>在当前节点新建记忆<kbd>⌘ N</kbd></div><div>新建子树<kbd>⇧ ⌘ N</kbd></div><div>展开 / 折叠树层级<kbd>→ / ←</kbd></div><div>在树中导航 / 选中<kbd>↑ ↓ / Enter</kbd></div><div>编辑节点 / 删除子树<kbd>F2 / ⌫</kbd></div><div>{NATIVE?'撤销当前提示中的删除 / 重试恢复':'撤销移动、删除或撤销安装'}<kbd>⌘ Z</kbd></div></div><p className="tw-demo-note">拖拽节点可移动整棵子树。</p></Modal>}
  {toast&&<div className="toast" role="status"><CheckCircle size={18}/><span>{toast.text}</span>{toast.undo&&<button onClick={toast.undo}>{toast.actionLabel}</button>}</div>}
  {ctxMenu&&<div className="tw-ctx-menu" style={{left:ctxMenu.x,top:ctxMenu.y}} onMouseLeave={()=>setCtxMenu(null)}>
    <button onClick={()=>{const n=ctxMenu.node;setCtxMenu(null);setShareDialog({scopeId:n.memoryId||n.id})}}>分享此子树…</button>
    <button onClick={()=>{const n=ctxMenu.node;setCtxMenu(null);deleteMemory(n.memoryId||n.id).then(()=>{notify('已 forget');setMemories(ms=>ms.filter(m=>m.id!==n.memoryId&&m.id!==n.id))}).catch(e=>notify('forget 失败：'+errText(e)))}}>forget（软删）</button>
    <button onClick={()=>{const n=ctxMenu.node;setCtxMenu(null);if(confirm('彻底删除？密文清空不可恢复'))purgeMemory(n.memoryId||n.id).then(()=>{notify('已 purge');setMemories(ms=>ms.filter(m=>m.id!==n.memoryId&&m.id!==n.id))}).catch(e=>notify('purge 失败：'+errText(e)))}}>purge（彻底删除）</button>
  </div>}
 </div>;
}

function CurePage({notify,inv}){
 const [cureList,setCureList]=React.useState(null);
 const [cureBusy,setCureBusy]=React.useState(false);
 const [task,setTask]=React.useState(null);       // Maintenance task state: {id,status,logs,result}.
 const [plan,setPlan]=React.useState(null);       // Final local structural repair preview.
 const [planBusy,setPlanBusy]=React.useState(false);
 const [copied,setCopied]=React.useState(false);
 const [logBox,setLogBox]=React.useState(null);
 const [ds,setDs]=React.useState(null);           // AI provider key configuration state.
 const [dsOpen,setDsOpen]=React.useState(false);  // Whether the configuration panel is expanded.
 const [dsForm,setDsForm]=React.useState({key:'',base:'https://api.deepseek.com/v1',model:'deepseek-flash'});
 const [dsBusy,setDsBusy]=React.useState(false);
 const [backend,setBackend]=React.useState(null); // Choose the jev or ds backend for direct execution.
 const pollRef=React.useRef(null);
 // Read AI provider key configuration.
 const loadDs=React.useCallback(async()=>{
  try{const s=await inv('ds_key_status',{});setDs(s);setBackend(s.selected||'ds')}catch(e){setDs({configured:false,error:String(e)})}
 },[]);
 React.useEffect(()=>{loadDs()},[loadDs]);
 const pickBackend=async(b)=>{
  const prev=backend;setBackend(b);
  try{await inv('classify_backend_set',{backend:b})}catch(e){setBackend(prev);notify('切换失败：'+e)}
 };
 const saveDs=async()=>{
  if(!dsForm.key.trim()){notify('请填写 key');return}
  setDsBusy(true);
  try{
   const r=await inv('ds_key_save',backend==='jev'
    ?{key:dsForm.key.trim(),backend:'jev'}
    :{key:dsForm.key.trim(),base:dsForm.base.trim(),model:dsForm.model.trim(),backend:'ds'});
   notify('已保存到系统密钥环（槽位 '+(r.slot||'')+'）');
   setDsForm(f=>({...f,key:''}));setDsOpen(false);loadDs();
  }catch(e){notify('保存失败：'+e)}
  setDsBusy(false);
 };
 // Poll progress every 1.2 seconds until the task finishes.
 const startPoll=React.useCallback((tid,be)=>{
  if(pollRef.current)clearInterval(pollRef.current);
  pollRef.current=setInterval(async()=>{
   try{
    const t=await inv('task_status',{id:tid});
    setTask(t);
    if(t.status==='done'||t.status==='failed'){
     clearInterval(pollRef.current);pollRef.current=null;
     if(t.status==='done'){
      const r=t.result||{};
      const dur=fmtDur(taskElapsed(t));
      if(dur)try{localStorage.setItem('respire_reorder_last_'+(be||'ds'),String(taskElapsed(t)))}catch{}
      notify('重排完成：改挂 '+(r.applied||0)+' 条'+(dur?'，用时 '+dur:''));
     }else{notify('重排失败：'+(t.error||'未知'))}
    }
   }catch(e){/* Retry progress polling on the next interval. */}
  },1200);
 },[]);
 React.useEffect(()=>()=>{if(pollRef.current)clearInterval(pollRef.current)},[]);
 React.useEffect(()=>{if(logBox)logBox.scrollTop=logBox.scrollHeight},[task&&task.logs&&task.logs.length]);
 // Preview local structural repairs without applying changes.
 const doPlan=async()=>{
  if(planBusy)return;
  setPlanBusy(true);setCopied(false);
  try{
   const r=await inv('causal_plan',{});
   setPlan(JSON.stringify({ops:r.ops||[],warnings:r.warnings||[]},null,2));
   notify('本地结构修复预览已生成，尚未修改数据');
  }catch(e){notify('生成失败：'+e)}
  setPlanBusy(false);
 };
 const copyPlan=async()=>{
  if(!plan)return;
  try{
   await navigator.clipboard.writeText(plan);
   setCopied(true);notify('已复制到剪贴板');
  }catch(e){
   // Select the text when the clipboard API lacks a secure context.
   const ta=document.querySelector('.tw-plan-text');
   if(ta){const r=document.createRange();r.selectNodeContents(ta);const s=window.getSelection();s.removeAllRanges();s.addRange(r);notify('已选中，请按 Ctrl+C 复制')}
  }
 };
 // Apply final maintenance actions using the selected model service.
 const doReorder=async()=>{
  if(task&&task.status==='running')return;
  setTask({status:'running',logs:['▶ 正在启动…'],started:new Date().toISOString()});
  try{
   const r=await inv('causal_reorder',{apply:true,rounds:1,min_kids:3,backend:backend||'ds'});
   if(r&&r.task_id){setTask(t=>({...(t||{}),id:r.task_id,status:'running'}));startPoll(r.task_id,backend||'ds')}
   else{notify('重排：未取得任务 id')}
  }catch(e){notify('重排启动失败：'+e);setTask(null)}
 };
 const running=task&&task.status==='running';
 const dsKeyReady=backend==='jev'
  ?!!(ds&&ds.jev&&ds.jev.configured)
  :!!(ds&&ds.configured);
 const logs=(task&&task.logs)||[];
 // Elapsed time and progress.
 const fmtDur=s=>{if(s==null||!isFinite(s))return null;const t=Math.max(0,Math.round(s));const m=Math.floor(t/60),ss=t%60;return (m>0?m+'分':'')+ss+'秒'};
 const taskElapsed=t=>{
  if(!t||!t.started)return null;
  const a=Date.parse(t.started);if(isNaN(a))return null;
  const b=t.finished&&Date.parse(t.finished)||Date.now();
  return Math.max(0,(b-a)/1000);
 };
 const [,forceTick]=React.useState(0);
 React.useEffect(()=>{
  if(!running)return;
  const iv=setInterval(()=>forceTick(x=>x+1),50);
  return ()=>clearInterval(iv);
 },[running]);
 const elapsed=taskElapsed(task);
 // Show elapsed seconds continuously while the task runs.
 const fmtMs=s=>{if(s==null||!isFinite(s))return null;return Math.max(0,s).toFixed(2)+'s'};
 const lastDurs=React.useMemo(()=>{
  const read=k=>{try{const v=localStorage.getItem('respire_reorder_last_'+k);const n=v?parseFloat(v):null;return n!=null&&isFinite(n)?fmtDur(n):null}catch{return null}};
  return {jev:read('jev'),ds:read('ds')};
 },[task&&task.status]);
 return <section className="sv-page" aria-label="树况治理">
  <header className="sv-heading"><div><div className="sv-eyebrow"><Sparkle size={14}/> CURE</div><h1>散记归树，层级立起。</h1><p>预览本地结构修复，或使用已配置的模型服务执行改挂。</p></div></header>

  <div className="tw-cure-choices">
   {/* Preview local structural repairs. */}
   <div className="tw-choice-card">
    <div className="tw-choice-head"><strong>① 生成方案</strong><span className="tw-choice-tag">推荐 · 免 key</span></div>
    <p>预览断链、自挂或循环等结构问题的修复动作。<b>纯本地，不需要 key、不出网，也不修改数据。</b></p>
    <button className="sv-button sv-primary" disabled={planBusy} onClick={doPlan}>{planBusy?'生成中…':'生成方案'}</button>
   </div>
   {/* Execute maintenance directly. */}
   <div className="tw-choice-card">
    <div className="tw-choice-head"><strong>② 直接执行</strong><span className="tw-choice-tag tw-tag-auto">自动 · <b>需配置 key</b></span></div>
    <p>将所选记忆材料发送到已配置的模型服务，生成并应用有效的改挂动作。<b>不合并正文。</b>任务在后台执行；期间若记忆被修改，结果会被拒绝，请检查后重试。</p>
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
     <button className={'sv-button sv-primary'+(running?' is-busy':'')} disabled={running||!dsKeyReady} onClick={doReorder}>
      <span className={running?'tw-spin':''} style={{display:'inline-flex'}}><ArrowClockwise size={15}/></span>
      {running?'重排中…':'直接执行'}
     </button>
     {!dsKeyReady&&<button className="sv-button" onClick={()=>setDsOpen(v=>!v)}>配置 key</button>}
    </div>
    {!dsKeyReady&&<span className="tw-key-warn">⚠️ 未配置 key——「直接执行」不可用（「生成方案」不受影响）</span>}
   </div>
  </div>

  {/* AI backend and key configuration panel. */}
  <div className="tw-cure-config">
   <button className="tw-config-toggle" onClick={()=>setDsOpen(v=>!v)}>
    <Key size={14}/> AI 后端与 key 配置
    <span className={'tw-reorder-dot '+(dsKeyReady?'done':'')}/>
    <span className="tw-config-state">{ds?(dsKeyReady
      ?(backend==='jev'?'已配置（Jev · api.typesafe.ai）':'已配置（DS · '+ds.host+' · '+ds.model+'）')
      :'未配置'):'读取中…'}</span>
    <span style={{marginLeft:'auto'}}>{dsOpen?'收起':'展开'}</span>
   </button>
   {dsOpen&&<div className="tw-config-body">
    <label>AI 后端
     <select value={backend||'ds'} onChange={e=>pickBackend(e.target.value)} disabled={dsBusy}>
      <option value="jev">Jev（TypeSafe 官方 · 系统一模型）</option>
      <option value="ds">DS（DeepSeek 兼容 · 模拟 Jev）</option>
     </select>
    </label>
    {backend==='jev'
     ?<p className="tw-config-note">Jev：使用配置的模型服务进行分类。端点与模型固定（api.typesafe.ai · jev-latest）。取 key：<a href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">console.typesafe.ai/keys</a></p>
     :<p className="tw-config-note">key 存系统密钥环（不落明文文件），按端点分槽。缺省用官方 DeepSeek；也可填 b.ai 等中转端点。</p>}
    <label>API Key<input type="password" value={dsForm.key} placeholder={dsKeyReady?'（已配置，留空即不改）':(backend==='jev'?'apikey_…':'sk-…')} onChange={e=>setDsForm(f=>({...f,key:e.target.value}))}/></label>
    {backend!=='jev'&&<label>端点<input value={dsForm.base} onChange={e=>setDsForm(f=>({...f,base:e.target.value}))}/></label>}
    {backend!=='jev'&&<label>模型<input value={dsForm.model} onChange={e=>setDsForm(f=>({...f,model:e.target.value}))}/></label>}
    <div style={{display:'flex',gap:8}}>
     <button className="sv-button sv-primary" disabled={dsBusy} onClick={saveDs}>{dsBusy?'保存中…':'保存'}</button>
     <button className="sv-button" disabled={dsBusy} onClick={loadDs}>刷新状态</button>
    </div>
    {backend!=='jev'&&<p className="tw-config-note">取 key：<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">platform.deepseek.com/api_keys</a>；b.ai 等中转用其各自 key（不通用）。</p>}
   </div>}
  </div>

  {plan&&<div className="tw-reorder-panel">
   <div className="tw-reorder-head">
    <strong>方案已生成</strong>
    <small className="tw-reorder-id">{plan.length} 字符</small>
    <button className="sv-button" style={{marginLeft:'auto'}} onClick={copyPlan}>{copied?'✓ 已复制':'复制全部'}</button>
   </div>
   <div className="tw-plan-text">{plan}</div>
  </div>}

  {task&&<div className="tw-reorder-panel">
   <div className="tw-reorder-head">
    <span className={'tw-reorder-dot '+(task.status||'')}/>
    <strong>{task.status==='running'?'正在重排':task.status==='done'?'重排完成':task.status==='failed'?'重排失败':'准备中'}</strong>
    <span className="tw-reorder-hint">后端 {backend==='jev'?'Jev':'DS'}</span>
    {task.id&&<small className="tw-reorder-id">{task.id.slice(0,12)}</small>}
    {running&&<span className="tw-reorder-hint">可关掉此页，后台继续跑</span>}
   </div>
   {running&&<div style={{display:'flex',alignItems:'baseline',gap:10,margin:'4px 0 2px'}}>
     <span style={{fontSize:24,fontWeight:600,fontVariantNumeric:'tabular-nums',letterSpacing:'0.5px'}}>⏱ {fmtMs(elapsed)}</span>
     <span className="tw-reorder-hint">正在处理，完成后显示最终结果</span>
    </div>}
   {task.status==='done'&&(()=>{const r=task.result||{};return <div className="tw-reorder-hint" style={{margin:'4px 0'}}>{elapsed!=null&&<>用时 {fmtDur(elapsed)} · </>}改挂 {r.applied||0} 条{r.tokens?<> · token {r.tokens.input||0}/{r.tokens.output||0}</>:null}</div>})()}
   {(lastDurs.jev||lastDurs.ds)&&<div className="tw-reorder-hint" style={{margin:'2px 0 4px'}}>上次用时对比：{lastDurs.jev?<>Jev {lastDurs.jev}</>:null}{lastDurs.jev&&lastDurs.ds?' ｜ ':null}{lastDurs.ds?<>DS {lastDurs.ds}</>:null}</div>}
   <div className="tw-reorder-log" ref={el=>setLogBox(el)}>
    {logs.map((l,i)=><div key={i} className="tw-log-line">{l}</div>)}
    {running&&<div className="tw-log-line tw-log-cursor">▌</div>}
   </div>
  </div>}

   <div className="sv-section-heading"><div><h2>归纲建议{cureList?' ('+cureList.length+')':''}</h2><p>查看可用的归纲建议，确认后应用。</p></div>
    {cureList&&cureList.length>1&&<button className="sv-button sv-primary" disabled={cureBusy} onClick={async()=>{setCureBusy(true);let ok=0;for(const c of cureList){try{await inv('attach',{id:c.orphan.id,parent:c.target.id});ok++}catch(e){notify('挂载失败：'+e)}}notify('已归纲 '+ok+' 条');setCureList(null);setCureBusy(false)}}>全部归纲（{cureList.length}）</button>}
    <button className="sv-button" disabled={cureBusy} onClick={async()=>{setCureBusy(true);try{const r=await inv('tree_cure',{top:60});setCureList(r.suggests||[])}catch(e){notify('加载失败：'+e)}setCureBusy(false)}}>刷新建议</button></div>
  {cureList&&cureList.map(c=><div className="sv-grant-row" key={c.orphan.id}><span className="sv-tool-mark" aria-hidden="true"><FileText size={18}/></span><div className="sv-grant-copy"><strong>{c.orphan.title}</strong><span>→ {c.target.title}（树：{c.target_tree.title}）</span></div><div className="sv-grant-actions"><button className="sv-button" onClick={async()=>{try{await inv('attach',{id:c.orphan.id,parent:c.target.id});setCureList(l=>l.filter(x=>x.orphan.id!==c.orphan.id))}catch(e){notify('挂载失败：'+e)}}}>归纲</button></div></div>)}
  {cureList&&!cureList.length&&<div className="sv-state sv-state-current"><CheckCircle size={13}/>暂无归纲建议</div>}
 </section>;
}

function ArrowDownMarker(){return <span className="tw-down-arrow">↓</span>}

/* Personal spaces support read-write, read-only, and disabled modes. Changing modes regenerates injected context. Team read-only grants remain enforced by the CLI. */
function WorkspaceModeRow({inv,notify}){
 const [mode,setMode]=useState(null);
 const [busy,setBusy]=useState(false);
 React.useEffect(()=>{
  let dead=false;
  inv('workspace_mode_get',{}).then(r=>{if(!dead)setMode(r.mode||'normal')}).catch(()=>{if(!dead)setMode(null)});
  return ()=>{dead=true};
 },[]);
 const set=async(m)=>{
  if(busy||m===mode||m==null)return;
  setBusy(true);
  try{
   await inv('workspace_mode_set',{mode:m});
   setMode(m);
   notify(m==='off'?'记忆已临时关闭——注入源已换成关闭提示（AI 不再调记忆命令）'
        :m==='readonly'?'已切只读——注入源已换成只读提示（AI 只能翻不能写）'
        :'已恢复正常读写——注入源已换回正常版');
  }catch(e){notify('切换失败：'+errText(e))}
  setBusy(false);
 };
 const btn=(m,label)=>(<button key={m} className={mode===m?'active':''} disabled={busy||mode==null} onClick={()=>set(m)}>{label}</button>);
 return <div className="tw-preference-row" title="个人空间三态：正常读写 / 只读（只能翻不能写）/ 临时关闭（AI 完全不用记忆）。切换后自动给全部已注入目标换对应提示词。">
  <div><strong>记忆状态</strong><span>{mode==='off'?'当前：临时关闭——查忆存忆皆停':mode==='readonly'?'当前：只读——AI 只能翻不能写':mode==='normal'?'当前：正常读写':'读取中…'}</span></div>
  <div className="view-tabs">{btn('normal','正常')}{btn('readonly','只读')}{btn('off','关闭')}</div>
 </div>;
}
