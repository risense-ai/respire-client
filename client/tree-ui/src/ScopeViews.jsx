import React from 'react';
import { ArrowClockwise, CheckCircle, Clock, Code, Command, DownloadSimple, Eye, Info, PencilSimple, TerminalWindow, TreeStructure } from '@phosphor-icons/react';
import { ROOT_ID, memoriesInScope, nodeById, pathFor, subtreeIds } from './treeModel.js';
import './scope-views.css';

function scopePath(nodes, id) {
  return pathFor(nodes, id).map(node => node.title).join(' / ') || '作用域已移除';
}

function displayTime(value) {
  if (!value) return '尚未同步';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}


function RealInjectCard() {
  const [targets, setTargets] = React.useState(null);
  const [busy, setBusy] = React.useState('');
  const busyRef = React.useRef(false);
  const [result, setResult] = React.useState('');
  const [preview, setPreview] = React.useState(null);
  const inv = (cmd, args = {}) => { const f = window.__TAURI__?.core?.invoke; return f ? f(cmd, args) : Promise.reject(new Error("非本地客户端（未连 Tauri）")); };
  const load = React.useCallback(async () => {
    const ts = await inv('inject_targets');
    if (!Array.isArray(ts)) throw new Error('应用列表返回格式无效');
    setTargets(ts);
  }, []);
  React.useEffect(() => { load().catch(e => setResult('读取应用列表失败：' + (e.message || String(e)))); }, [load]);
  const act = async (id, remove) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(id + (remove ? '-rm' : ''));
    setResult('');
    try {
      if (id === 'codex') {
        const value = await inv('inject_preview', { remove });
        if (!value || typeof value.before !== 'string' || typeof value.after !== 'string' || typeof value.revision !== 'string') throw new Error('预览返回格式无效');
        setPreview({...value, remove});
        return;
      }
      const value = await inv(remove ? 'inject_remove' : 'inject', { id });
      if (typeof value?.changed !== 'boolean') throw new Error('写入结果格式无效，请刷新检查目标文件');
      setResult(value.changed ? (remove ? '已移除注入内容' : '已写入注入内容') : '文件无需变化');
      try { await load(); } catch (e) { setResult('操作已完成，但状态刷新失败：' + (e.message || String(e))); }
    } catch (e) { setResult('操作失败：' + (e.message || String(e))); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const applyPreview = async () => {
    if (busyRef.current || !preview) return;
    busyRef.current = true; setBusy('codex'); setResult('');
    try {
      const value = await inv('inject_apply', {remove: preview.remove, revision: preview.revision});
      if (typeof value?.changed !== 'boolean') throw new Error('写入结果格式无效，请刷新检查目标文件');
      setResult(value.changed ? (preview.remove ? '已移除 Codex 注入块' : '已写入 Codex 注入块') : '文件无需变化');
      setPreview(null);
      try { await load(); } catch (e) { setResult('操作已完成，但状态刷新失败：' + (e.message || String(e))); }
    } catch (e) { setResult('写入失败：' + (e.message || String(e))); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const sorted = [...(targets || [])].sort((a, b) => (b.likely_installed ? 1 : 0) - (a.likely_installed ? 1 : 0));
  const fresh = sorted.filter(t => t.state === 'fresh').length;
  return (<div style={{ marginTop: 18 }}>
    <div className="sv-section-heading"><div><h2>可安装的应用 · 记忆铁律注入 <span>{fresh}/{sorted.length}</span></h2><p>写入各 AI 的提示文件。</p></div><button className="sv-button" disabled={Boolean(busy)} onClick={() => load().then(() => setResult('应用状态已刷新')).catch(e => setResult('读取应用列表失败：' + (e.message || String(e))))}>刷新</button></div>
    {result && <p role="status">{result}</p>}
    {!targets && !result && <p role="status">正在读取应用列表…</p>}
    {preview && <section aria-label="Codex 写入预览">
      <h3>{preview.remove ? '卸载' : '注入 / 更新'} Codex</h3><p>{preview.path}</p>
      <p>仅改标记块；写入不等于已读取。</p>
      <label>修改前<textarea readOnly rows={6} style={{width:'100%'}} value={preview.before}/></label>
      <label>修改后<textarea readOnly rows={6} style={{width:'100%'}} value={preview.after}/></label>
      <div className="sv-grant-actions"><button className="sv-button" disabled={Boolean(busy)} onClick={() => setPreview(null)}>取消</button><button className="sv-button" disabled={Boolean(busy)} onClick={() => act('codex', preview.remove)}>重新预览</button><button className="sv-button sv-primary" disabled={Boolean(busy) || !preview.changed} onClick={applyPreview}>{preview.changed ? '确认写入' : '无需修改'}</button></div>
    </section>}
    <div className="sv-grant-list" style={{ marginBottom: 8 }}>{sorted.map(t => (
      <div className="sv-grant-row" key={t.id} style={t.likely_installed ? undefined : { opacity: 0.55 }}>
        <span className="sv-tool-mark" aria-hidden="true"><TerminalWindow size={20} /></span>
        <div className="sv-grant-copy"><strong>{t.name}{t.likely_installed ? '' : ' · 未检测'}</strong><span title={t.path}>{t.path}</span></div>
        <span className={'sv-state ' + (t.state === 'fresh' ? 'sv-state-current' : t.state === 'stale' ? 'sv-state-pending' : '')}>{t.state === 'fresh' ? '已注入·最新' : t.state === 'stale' ? '待更新' : t.state === 'manual' ? '需手动处理配置' : t.state === 'none' ? '未注入' : '未写入'}</span>
        <div className="sv-grant-actions">
          <button className="sv-button" disabled={Boolean(busy) || Boolean(preview)} onClick={() => act(t.id, false)}>{t.id === 'codex' ? '预览注入 / 更新' : '注入 / 更新'}</button>
          {(t.state === 'fresh' || t.state === 'stale') && <button className="sv-button sv-danger" disabled={Boolean(busy) || Boolean(preview)} onClick={() => act(t.id, true)}>{t.id === 'codex' ? '预览卸载' : '卸载'}</button>}
        </div>
      </div>))}</div>
  </div>);
}

function errText(e) {
  if (typeof e === 'string') return e;
  if (e && typeof e.message === 'string') return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

function RealSyncCard({ statusInfo, onCloudSync, cloudBusy, onOpenGate, syncResult = '', syncFailed = false, countsError = '' }) {
  const [info, setInfo] = React.useState(statusInfo || null);
  const [statusError, setStatusError] = React.useState('');
  const inv = (cmd, args = {}) => { const f = window.__TAURI__?.core?.invoke; return f ? f(cmd, args) : Promise.reject(new Error("非本地客户端（未连 Tauri）")); };
  React.useEffect(() => { if (statusInfo) { setInfo(statusInfo); setStatusError(''); } }, [statusInfo]);
  React.useEffect(() => {
    if (statusInfo) return;
    inv('status').then(value => { setInfo(value); setStatusError(''); }).catch(e => { setInfo(null); setStatusError('读取账号连接失败：' + errText(e)); });
  }, [statusInfo]);
  const result = syncResult || statusError;
  const failed = syncResult ? syncFailed : Boolean(statusError);
  const countsBlocked = Boolean(countsError || statusError);
  if (!info && !result && !countsError) return <p role="status">正在读取账号连接…</p>;
  const connected = !!(info && info.session && info.session.has_token);
  const user = info?.session?.user;
  return (<div style={{ marginTop: 18 }}>
    <div className="sv-section-heading"><div><h2>本地库 ↔ 云端</h2><p>端到端加密同步。失败显示真实错误并可重试；成功后刷新记忆列表。不会把失败显示为成功。</p></div></div>
    <div className="sv-sync-flow" style={{ margin: '10px 0 18px' }}>
      <div className="sv-sync-node"><span className="sv-small-label">本机</span><strong>{countsBlocked || info?.local_alive == null ? '—' : info.local_alive} 条</strong>{(() => { if (countsBlocked) return <span>—</span>; const dead = (info?.local_total ?? 0) - (info?.local_alive ?? 0); return <span>{dead > 0 ? `${dead} 条墓碑待清（purge 可清）` : '无墓碑'}</span>; })()}</div>
      <span className="sv-sync-arrow">⇄</span>
      <div className="sv-sync-node"><span className="sv-small-label">云端</span><strong>{connected ? '已连接' : '未连接'}</strong><span>{user || '需要登录或五件套接入'}</span></div>
      <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
        {!connected && <button className="sv-button sv-primary" type="button" onClick={() => onOpenGate && onOpenGate()}>登录 / 接入云端</button>}
      </div>
      {countsError && <span className="sv-state" role="alert">{countsError}</span>}
      {result && <span className="sv-state" role={failed ? 'alert' : 'status'}>{result}</span>}
    </div>
  </div>);
}

function ToolMark({ name = '' }) {
  const lower = name.toLowerCase();
  if (lower.includes('claude')) return <span className="sv-tool-mark sv-claude" aria-hidden="true">✳</span>;
  const Icon = lower.includes('chatgpt') || lower.includes('codex') ? Command : lower.includes('code') ? Code : TerminalWindow;
  return <span className="sv-tool-mark" aria-hidden="true"><Icon size={20} /></span>;
}

function SyncStatus({ item }) {
  if (item.status === 'syncing') return <span className="sv-state sv-state-syncing"><ArrowClockwise size={13} className="sv-spin" />正在同步</span>;
  if (!item.enabled) return <span className="sv-state"><span className="sv-dot" />已暂停</span>;
  if (item.pending) return <span className="sv-state sv-state-pending"><Clock size={13} />待同步</span>;
  return <span className="sv-state sv-state-current"><CheckCircle size={13} />已一致</span>;
}

function Permission({ value }) {
  return <span className={`sv-permission ${value === 'write' ? 'sv-permission-write' : ''}`}>{value === 'write' ? <PencilSimple size={13} /> : <Eye size={13} />}{value === 'write' ? '可读写' : '只读'}</span>;
}

function DemoNote() {
  const real = Boolean(window.__TAURI__?.core?.invoke);
  return <div className="sv-demo-note"><Info size={15} /><p>{real ? '真库模式：注入与同步即时生效。' : '本地演示：未写入外部应用。'}</p></div>;
}

function isRelatedScope(nodes, scopeId, selectedId) {
  return subtreeIds(nodes, scopeId).includes(selectedId) || subtreeIds(nodes, selectedId).includes(scopeId);
}

export function InstallView({ nodes = [], memories = [], selectedId = ROOT_ID, onInstall }) {
  return <section className="sv-page sv-install-page" aria-labelledby="sv-install-title">
    <header className="sv-heading"><div><div className="sv-eyebrow"><DownloadSimple size={14} /> INSTALL</div><h1 id="sv-install-title">把选定的记忆，带到 AI。</h1><p>把铁律注入各 AI，或把子树交给某个 AI。</p></div></header>

    <RealInjectCard />

    <div className="sv-section-heading" style={{marginTop:24}}><div><h2>子树安装入口</h2></div></div>
    <div className="sv-permission-guide"><TreeStructure size={17} /><div><strong>在哪装子树？</strong><p>Tree 页选节点 → 「安装此子树」。</p></div></div>
  </section>;

}

export function SyncView({ nodes = [], memories = [], installations = [], autoSync = true, onAutoSync, onRefresh, onRefreshAll, onSelectScope, selectedId = ROOT_ID, lastSavedAt, statusInfo, onCloudSync, cloudBusy, onOpenGate, syncResult = '', syncFailed = false, statusCountsError = '' }) {
  const enabled = installations.filter(item => item.enabled);
  const syncing = enabled.some(item => item.status === 'syncing');
  const real = Boolean(window.__TAURI__?.core?.invoke);
  const headerSync = real
    ? () => { if (onCloudSync) onCloudSync(); }
    : () => { if (onRefreshAll) onRefreshAll(); };
  const headerBusy = real ? !!cloudBusy : syncing;
  const headerDisabled = real ? (headerBusy || !statusInfo?.remote_configured) : (syncing || !enabled.length);
  // Keep a brief success state after fast synchronization so users can see the operation completed.
  const [justDone, setJustDone] = React.useState(false);
  React.useEffect(() => {
    if (cloudBusy || !syncResult || syncFailed) { setJustDone(false); return undefined; }
    setJustDone(true);
    const timer = setTimeout(() => setJustDone(false), 2600);
    return () => clearTimeout(timer);
  }, [cloudBusy, syncResult, syncFailed]);

  return <section className="sv-page sv-sync-page" aria-labelledby="sv-sync-title">
    <header className="sv-heading"><div><div className="sv-eyebrow"><ArrowClockwise size={14} /> SYNC</div><h1 id="sv-sync-title">与云端保持一致。</h1><p>本机权威；增量同步，端到端加密。</p></div><button className="sv-button sv-primary" onClick={headerSync} disabled={headerDisabled}>{headerBusy ? <ArrowClockwise size={16} className="sv-spin" /> : justDone ? <CheckCircle size={16} /> : <ArrowClockwise size={16} />}{headerBusy ? '正在同步' : justDone ? '已同步' : (real ? (syncFailed ? '重试同步' : '立即同步') : '同步全部')}</button></header>

    {real && <RealSyncCard statusInfo={statusInfo} onCloudSync={onCloudSync} cloudBusy={cloudBusy} onOpenGate={onOpenGate} syncResult={syncResult} syncFailed={syncFailed} countsError={statusCountsError} />}
    {lastSavedAt && <div className="sv-small-label" style={{marginTop:10}}>最近同步 {displayTime(lastSavedAt)}</div>}
  </section>;
}
