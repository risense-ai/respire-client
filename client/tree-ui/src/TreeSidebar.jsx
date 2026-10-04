import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Article, CaretRight, FolderSimple, LinkSimple } from '@phosphor-icons/react';
import { ROOT_ID, DIARY_ID, canMove, nodeById, pathFor } from './treeModel.js';

const DRAG_TYPE = 'application/x-respire-tree-node';
// Initially show five children per level, with additional pages available on demand.
const PAGE_SIZE = 5;

function isExpanded(expanded, id) {
  if (expanded instanceof Set) return expanded.has(id);
  if (Array.isArray(expanded)) return expanded.includes(id);
  if (expanded && typeof expanded === 'object') return !!expanded[id];
  return id === ROOT_ID;
}

export default function TreeSidebar({
  nodes = [], selectedId = ROOT_ID, expanded, onToggle, onSelect,
  onMove, onNew, onRename, onDelete, installations = [], onContextNode,
}) {
  const [focusedId, setFocusedId] = useState(selectedId);
  const [moreCount, setMoreCount] = useState(() => new Map()); // Track the number of extra five-entry pages loaded per level.
  const [draggedId, setDraggedId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const rowRefs = useRef(new Map());
  const previousSelection = useRef(selectedId);

  const children = useMemo(() => {
    const grouped = new Map();
    nodes.forEach(node => {
      if (node.parentId === DIARY_ID) return; // Diary dates appear in the main calendar rather than the sidebar.
      if (!grouped.has(node.parentId)) grouped.set(node.parentId, []);
      grouped.get(node.parentId).push(node);
    });
    return grouped;
  }, [nodes]);

  const visible = useMemo(() => {
    const rows = [];
    const visited = new Set();
    const visit = (siblings, depth, parentId) => {
      // Keep the diary first at the root without consuming a pagination slot.
      const pinned = parentId === ROOT_ID ? siblings.filter(node => node.id === DIARY_ID) : [];
      const rest = parentId === ROOT_ID ? siblings.filter(node => node.id !== DIARY_ID) : siblings;
      const limit = PAGE_SIZE * (1 + (moreCount.get(parentId) || 0));
      const shownRest = rest.length > limit ? rest.slice(0, limit) : rest;
      const shown = [...pinned, ...shownRest];
      shown.forEach((node, index) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        rows.push({ node, depth, position: index + 1, siblingCount: shown.length });
        if (isExpanded(expanded, node.id)) visit(children.get(node.id) || [], depth + 1, node.id);
      });
      if (shownRest.length < rest.length) {
        rows.push({ more: { parentId, hidden: rest.length - shownRest.length }, depth: depth + 1 });
      }
    };
    const root = nodeById(nodes, ROOT_ID);
    visit(root ? [root] : nodes.filter(node => node.parentId == null), 0, '__top__');
    return rows;
  }, [nodes, children, expanded, moreCount]);

  const navRows = useMemo(() => visible.filter(row => row.node), [visible]);
  const visibleIds = useMemo(() => new Set(navRows.map(row => row.node.id)), [navRows]);
  // Expand ancestors and pages as needed to keep the selected node visible.
  useEffect(() => {
    let cursor = selectedId;
    for (let guard = 0; cursor && guard < 40; guard += 1) {
      const parentId = nodeById(nodes, cursor)?.parentId;
      if (!parentId) break;
      const siblings = children.get(parentId) || [];
      const rest = parentId === ROOT_ID ? siblings.filter(node => node.id !== DIARY_ID) : siblings;
      const index = rest.findIndex(node => node.id === cursor);
      if (index >= PAGE_SIZE) {
        const need = Math.ceil((index + 1) / PAGE_SIZE) - 1; // Load enough pages to include the selected child.
        setMoreCount(current => (current.get(parentId) || 0) >= need ? current : new Map(current).set(parentId, need));
      }
      cursor = parentId;
    }
  }, [selectedId, nodes, children]);
  useEffect(() => {
    if (previousSelection.current === selectedId) return;
    previousSelection.current = selectedId;
    if (visibleIds.has(selectedId)) setFocusedId(selectedId);
  }, [selectedId, visibleIds]);
  useEffect(() => {
    if (visibleIds.has(focusedId)) return;
    const ancestor = pathFor(nodes, focusedId).reverse().find(node => visibleIds.has(node.id));
    setFocusedId(ancestor?.id ?? navRows[0]?.node.id ?? null);
  }, [focusedId, nodes, visible, visibleIds]);

  const focusRow = id => {
    if (!visibleIds.has(id)) return;
    setFocusedId(id);
    rowRefs.current.get(id)?.focus();
  };
  const selectRow = id => {
    focusRow(id);
    onSelect?.(id);
  };
  const toggleRow = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    focusRow(id);
    onToggle?.(id);
  };

  const handleKeyDown = event => {
    if (event.target.isContentEditable || event.target.closest?.('input, textarea, select')) return;
    const key = event.key;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'n') {
      event.preventDefault();
      event.stopPropagation();
      onNew?.(event.shiftKey ? 'tree' : 'memory');
      return;
    }
    const node = nodeById(nodes, focusedId);
    if (!node) return;
    const index = navRows.findIndex(row => row.node.id === node.id);
    const childNodes = children.get(node.id) || [];
    const open = isExpanded(expanded, node.id);
    let handled = true;
    switch (key) {
      case 'ArrowDown':
        focusRow(navRows[Math.min(index + 1, navRows.length - 1)]?.node.id);
        break;
      case 'ArrowUp':
        focusRow(navRows[Math.max(index - 1, 0)]?.node.id);
        break;
      case 'ArrowRight':
        if (childNodes.length && !open) onToggle?.(node.id);
        else if (childNodes.length) focusRow(childNodes[0].id);
        break;
      case 'ArrowLeft':
        if (childNodes.length && open) onToggle?.(node.id);
        else if (node.parentId) focusRow(node.parentId);
        break;
      case 'Home':
        focusRow(visible[0]?.node.id);
        break;
      case 'End':
        focusRow(visible[visible.length - 1]?.node.id);
        break;
      case 'Enter':
      case ' ':
        onSelect?.(node.id);
        break;
      case 'F2':
        onRename?.(node);
        break;
      case 'Backspace':
      case 'Delete':
        onDelete?.(node);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const endDrag = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };

  return <div className="tw-tree" role="tree" aria-label="记忆树" onKeyDown={handleKeyDown}>
    <div className="tw-tree-inner">
    {visible.map(({ node, more, depth, position, siblingCount }) => {
      if (more) return <div className="tw-tree-more" key={`more-${more.parentId}`} style={{ paddingLeft: 8 + depth * 16 }}>
        <button type="button" aria-label={`加载更多，还有 ${more.hidden} 个节点`} onClick={() => setMoreCount(current => new Map(current).set(more.parentId, (current.get(more.parentId) || 0) + 1))}>加载更多<small>还有 {more.hidden} 个</small></button>
      </div>;
      const hasChildren = (children.get(node.id)?.length || 0) > 0;
      const open = isExpanded(expanded, node.id);
      const scopedInstalls = installations.filter(item => item.scopeId === node.id && item.connected !== false && item.enabled !== false);
      const installNames = scopedInstalls.map(item => item.name || item.toolName || item.tool || 'AI 工具').join('、');
      const installLabel = `${scopedInstalls.length} 个工具使用此范围${installNames ? `：${installNames}` : ''}`;
      const selected = node.id === selectedId;
      return <div
        key={node.id}
        ref={element => {
          if (element) rowRefs.current.set(node.id, element);
          else rowRefs.current.delete(node.id);
        }}
        className={`tw-tree-row${selected ? ' is-selected' : ''}${dropTargetId === node.id ? ' is-drag-over' : ''}${draggedId === node.id ? ' is-dragging' : ''}`}
        role="treeitem"
        aria-level={depth + 1}
        aria-posinset={position}
        aria-setsize={siblingCount}
        aria-selected={selected}
        aria-expanded={hasChildren ? open : undefined}
        tabIndex={node.id === focusedId ? 0 : -1}
        style={{ paddingLeft: 8 + depth * 16 }}
        title={node.title}
        onFocus={() => setFocusedId(node.id)}
        onClick={() => selectRow(node.id)}
        onContextMenu={event => { event.preventDefault(); onContextNode?.(node, event); }}
        onDoubleClick={() => { if (hasChildren) onToggle?.(node.id); }}
        draggable={node.id !== ROOT_ID}
        onDragStart={event => {
          if (node.id === ROOT_ID) { event.preventDefault(); return; }
          event.dataTransfer.setData(DRAG_TYPE, node.id);
          event.dataTransfer.effectAllowed = 'move';
          setDraggedId(node.id);
        }}
        onDragOver={event => {
          if (!draggedId || !canMove(nodes, draggedId, node.id)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          setDropTargetId(node.id);
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDropTargetId(current => current === node.id ? null : current);
        }}
        onDrop={event => {
          event.preventDefault();
          event.stopPropagation();
          const movingId = draggedId || event.dataTransfer.getData(DRAG_TYPE);
          if (canMove(nodes, movingId, node.id)) onMove?.(movingId, node.id);
          endDrag();
        }}
        onDragEnd={endDrag}
      >
        {hasChildren
          ? <button className={`tw-tree-chevron${open ? ' is-open' : ''}`} tabIndex={-1} aria-label={`${open ? '折叠' : '展开'} ${node.title}`} onClick={event => toggleRow(event, node.id)}><CaretRight size={12} weight="bold" /></button>
          : <span className="tw-tree-chevron is-leaf" aria-hidden="true" />}
        <span className={`tw-tree-icon${node.kind === 'tree' ? ' is-tree' : ' is-memory'}`} aria-hidden="true">
          {node.kind === 'tree' ? <FolderSimple size={17} weight={selected ? 'duotone' : 'regular'} /> : <Article size={16} />}
        </span>
        <span className="tw-tree-label">{node.title}</span>
        {scopedInstalls.length > 0 && <span className="tw-tree-install" title={installLabel} aria-label={installLabel}><LinkSimple size={12} /><span>{scopedInstalls.length}</span></span>}
      </div>;
    })}
    </div>
  </div>;
}
