import React, { useEffect, useMemo, useState } from 'react';
import { collections, typeInfo } from './data';
import { getContextIds, getRelatedMemories } from './memoryModel';
import './memory-graph.css';

const contextName = id => collections.find(item => item.id === id)?.name || id;
const shortTitle = (title = '', length = 15) => title.length > length ? `${title.slice(0, length)}…` : title;
const positions = [{ x: 18, y: 29 }, { x: 82, y: 29 }, { x: 82, y: 83 }];

function Mark({ name = 'memory', size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'back' ? <path d="m14 6-6 6 6 6" /> : name === 'arrow' ? <><path d="M5 12h14m-5-5 5 5-5 5" /></> : name === 'context' ? <><path d="m9 3-2 18M17 3l-2 18M3 9h18M2 15h18" /></> : name === 'source' ? <><rect x="4" y="5" width="16" height="12" rx="3"/><path d="M9 21h6m-3-4v4m-4-11 2 2-2 2m5 0h3" /></> : <><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="18" cy="19" r="2"/><path d="m7 7 3 3m4-1 3-2m-3 8 3 3"/></>}
  </svg>;
}

function neighborhood(memory, memories) {
  if (!memory) return [];
  const related = getRelatedMemories(memory, memories);
  const known = new Set([memory.id, ...related.map(item => item.id)]);
  const contextIds = getContextIds(memory);
  const shared = memories.filter(item => !known.has(item.id) && getContextIds(item).some(id => contextIds.includes(id)));
  return [...related.map(item => ({ memory: item, relation: '关联' })), ...shared.map(item => ({ memory: item, relation: '共享上下文' }))];
}

export default function MemoryGraph({ memories = [], selected, onSelect, native = false }) {
  const [focusId, setFocusId] = useState(selected || memories[0]?.id);
  const [history, setHistory] = useState([]);
  const [lens, setLens] = useState(null);

  useEffect(() => {
    if (selected) { setFocusId(selected); setHistory([]); setLens(null); }
  }, [selected]);

  const focus = memories.find(item => item.id === focusId) || memories.find(item => item.id === selected) || memories[0];
  const neighbors = useMemo(() => neighborhood(focus, memories), [focus, memories]);
  const contexts = focus ? getContextIds(focus) : [];
  const relatedCount = focus ? getRelatedMemories(focus, memories).length : 0;
  const lensMemories = !lens ? [] : memories.filter(item => lens.kind === 'context' ? getContextIds(item).includes(lens.id) : item.source === lens.id);
  const visible = (lens ? lensMemories.filter(item => item.id !== focus?.id).map(memory => ({ memory, relation: lens.kind === 'context' ? '共享上下文' : '共同来源' })) : neighbors).slice(0, 3);

  const recenter = id => {
    if (id !== focus?.id) setHistory(previous => [...previous, focus?.id].filter(Boolean));
    setFocusId(id); setLens(null);
  };
  const goBack = () => {
    const previous = history[history.length - 1];
    if (previous) { setFocusId(previous); setHistory(current => current.slice(0, -1)); setLens(null); }
  };

  if (!focus) return <section className="mg-empty"><Mark size={34}/><h2>连接，从一段记忆开始</h2><p>在这里探索记忆之间的关联。</p></section>;

  const edgeNodes = [
    ...visible.map((item, index) => ({ ...positions[index], label: item.relation, key: item.memory.id })),
    ...(contexts.length ? [{ x: 18, y: 83, label: '关联上下文', key: 'context' }] : []),
    ...(focus.source ? [{ x: 50, y: 9, label: '来自', key: 'source' }] : []),
  ];

  return <section className="mg-view" aria-label="记忆图谱">
    <div className="mg-heading"><div><span className="mg-eyebrow"><Mark size={13}/> MEMORY CONNECTIONS</span><h1>记忆，在连接中生长</h1><p>沿着一段记忆，发现共同的语境与来处。</p></div><span className="mg-sample">{native ? '本机数据' : '演示数据'}</span></div>
    <div className="mg-navigation">
      <button className="mg-back" onClick={goBack} disabled={!history.length} aria-label="返回上一个图谱焦点"><Mark name="back" size={14}/><span>返回</span></button>
      <span className="mg-navigation-label">{lens ? `${lens.kind === 'context' ? '上下文' : '来源'} · ${lens.kind === 'context' ? contextName(lens.id) : lens.id}` : '以当前记忆为中心'}</span>
      {lens && <button className="mg-clear" onClick={() => setLens(null)}>清除筛选 ×</button>}
      {!lens && <span className="mg-navigation-hint">点击节点继续探索</span>}
    </div>
    <div className="mg-stage" aria-label={`围绕${focus.title}的关联图`}>
      <svg className="mg-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {edgeNodes.map(node => <line key={node.key} x1="50" y1="54" x2={node.x} y2={node.y} className={node.label === '共享上下文' || node.key === 'context' ? 'mg-edge-context' : ''}/>)}
      </svg>
      {edgeNodes.map(node => <span key={node.key} className={`mg-edge-label mg-edge-label-${node.key === 'source' ? 'source' : 'relation'}`} style={{ left: `${(node.x + 50) / 2}%`, top: `${(node.y + 54) / 2}%` }}>{node.label}</span>)}
      <div className="mg-node mg-node-focus" style={{ left: '50%', top: '54%' }}>
        <span className="mg-focus-mark"><Mark size={20}/></span><span className="mg-node-kicker">{typeInfo[focus.type]?.label || '记忆'} · 当前焦点</span><strong>{focus.title}</strong>
      </div>
      {visible.map(({ memory, relation }, index) => <button key={memory.id} className="mg-node mg-node-memory" style={{ left: `${positions[index].x}%`, top: `${positions[index].y}%` }} onClick={() => recenter(memory.id)} title={memory.title} aria-label={`探索${memory.title}，${relation}`}>
        <span className={`mg-node-dot mg-dot-${memory.type}`}/><span className="mg-node-kicker">{typeInfo[memory.type]?.label || '记忆'} · {relation}</span><strong>{memory.title}</strong><span className="mg-node-explore">展开连接 <Mark name="arrow" size={11}/></span>
      </button>)}
      {contexts.length > 0 && <button className={`mg-node mg-node-context ${lens?.kind === 'context' ? 'mg-node-active' : ''}`} style={{ left: '18%', top: '83%' }} onClick={() => setLens({ kind: 'context', id: contexts[0] })} aria-label={`查看上下文${contextName(contexts[0])}中的记忆`}><span className="mg-node-kicker"><Mark name="context" size={12}/> 上下文</span><strong>{contextName(contexts[0])}</strong><span className="mg-node-explore">查看共同语境</span></button>}
      {focus.source && <button className={`mg-node mg-node-source ${lens?.kind === 'source' ? 'mg-node-active' : ''}`} style={{ left: '50%', top: '9%' }} onClick={() => setLens({ kind: 'source', id: focus.source })} aria-label={native ? `查看来自${focus.source}的记忆` : `查看来自${focus.source}的演示记忆`}><Mark name="source" size={16}/><div><span className="mg-node-kicker">来源</span><strong>{focus.source}</strong></div></button>}
      {!visible.length && <span className="mg-no-neighbors">{lens ? '此范围暂时只有当前记忆' : '还没有与其他记忆建立连接'}</span>}
    </div>
    <div className="mg-legend"><span><i/>记忆关联</span><span><i className="mg-dashed"/>共同语境</span><span>来源表示记忆来处</span></div>
    <div className="mg-detail" aria-live="polite">
      <div className="mg-detail-top"><span>{typeInfo[focus.type]?.label || '记忆'}</span><span>{relatedCount} 条关联记忆</span></div>
      <h2>{focus.title}</h2><p>{focus.summary}</p>
      <div className="mg-detail-bottom"><div className="mg-context-chips">{contexts.map(id => <button key={id} onClick={() => setLens({ kind: 'context', id })} className={lens?.kind === 'context' && lens.id === id ? 'active' : ''}># {contextName(id)}</button>)}</div><button className="mg-read" onClick={() => onSelect?.(focus.id)}>阅读这段记忆 <Mark name="arrow" size={14}/></button></div>
    </div>
    {lens && <div className="mg-lens-results"><div className="mg-results-heading"><strong>{lens.kind === 'context' ? contextName(lens.id) : `来自 ${lens.id}`}</strong><span>{lensMemories.length} 段记忆{lens.kind === 'source' && !native ? ' · 演示来源' : ''}</span></div>{lensMemories.map(item => <button key={item.id} onClick={() => recenter(item.id)}><span className={`mg-node-dot mg-dot-${item.type}`}/><span>{item.title}</span>{item.id === focus.id ? <small>当前焦点</small> : <Mark name="arrow" size={13}/>}</button>)}</div>}
  </section>;
}

export function MiniMemoryGraph({ memory, memories = [], onSelect, onExplore }) {
  const neighbors = useMemo(() => neighborhood(memory, memories).slice(0, 3), [memory, memories]);
  const dots = [{ x: 23, y: 14 }, { x: 77, y: 14 }, { x: 50, y: 85 }];
  if (!memory) return null;
  return <div className="mini-memory-graph">
    <div className="mini-memory-stage" aria-label={`${memory.title}的记忆关联`}>
      <svg className="mini-memory-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{neighbors.map((item, index) => <line key={item.memory.id} x1="50" y1="48" x2={dots[index].x} y2={dots[index].y} className={item.relation === '共享上下文' ? 'mini-memory-shared' : ''}/>)}</svg>
      <button className="mini-memory-center" onClick={() => onExplore?.(memory.id)} title="在记忆图谱中探索"><Mark size={15}/><strong>{shortTitle(memory.title, 12)}</strong></button>
      {neighbors.map(({ memory: neighbor, relation }, index) => <button key={neighbor.id} className="mini-memory-neighbor" style={{ left: `${dots[index].x}%`, top: `${dots[index].y}%` }} onClick={() => onSelect?.(neighbor.id)} title={`${relation}：${neighbor.title}`} aria-label={`阅读关联记忆：${neighbor.title}`}><span>{relation}</span><strong>{shortTitle(neighbor.title, 11)}</strong></button>)}
      {!neighbors.length && <p className="mini-memory-empty">新的关联将在这里出现</p>}
    </div>
    <button className="mini-memory-open" onClick={() => onExplore?.(memory.id)}><span>在图谱中探索</span><Mark name="arrow" size={13}/></button>
  </div>;
}
