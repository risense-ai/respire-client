import React, { useMemo, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

// Diary calendar overview displays dates with records and their counts.
// The parent component opens the selected date's detail modal.
// Use local dates, matching the CLI diary titles in YYYY-MM-DD format.
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const pad2 = value => String(value).padStart(2, '0');
const keyOf = (year, month, day) => `${year}-${pad2(month + 1)}-${pad2(day)}`;

export default function DiaryCalendar({ days = [], onOpenDay }) {
  const byDay = useMemo(() => new Map(days.map(item => [item.day, item])), [days]);
  const today = useMemo(() => {
    const now = new Date();
    return keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  // Start at today; date selection opens the parent's detail modal.
  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { y: year, m: (month || 1) - 1 };
  });
  const [selected, setSelected] = useState(today);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday is the first column.
    const total = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const list = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= total; day += 1) list.push({ day: keyOf(cursor.y, cursor.m, day), label: day });
    return list;
  }, [cursor]);

  const monthCount = useMemo(
    () => cells.reduce((sum, cell) => sum + (cell ? (byDay.get(cell.day)?.items.length || 0) : 0), 0),
    [cells, byDay],
  );
  const shiftMonth = delta => setCursor(({ y, m }) => {
    const next = m + delta;
    return { y: y + Math.floor(next / 12), m: ((next % 12) + 12) % 12 };
  });
  const jumpToday = () => {
    const now = new Date();
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setSelected(today);
  };

  return <section className="tw-diary" aria-label="日记本日历">
    <header className="tw-diary-bar">
      <div className="tw-diary-nav">
        <button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}><CaretLeft size={15} weight="bold" /></button>
        <strong>{cursor.y} 年 {cursor.m + 1} 月</strong>
        <button type="button" aria-label="下个月" onClick={() => shiftMonth(1)}><CaretRight size={15} weight="bold" /></button>
      </div>
      <div className="tw-diary-meta">
        <span>本月 {monthCount} 条</span>
        <button type="button" onClick={jumpToday}>今天</button>
      </div>
    </header>
    <div className="tw-diary-week" aria-hidden="true">{WEEK_LABELS.map(label => <span key={label}>{label}</span>)}</div>
    <div className="tw-diary-grid" role="grid" aria-label={`${cursor.y} 年 ${cursor.m + 1} 月`}>
      {cells.map((cell, index) => {
        if (!cell) return <span className="tw-diary-cell is-blank" key={`blank-${index}`} />;
        const entry = byDay.get(cell.day);
        const count = entry?.items.length || 0;
        const classes = ['tw-diary-cell'];
        if (count) classes.push('has');
        if (cell.day === today) classes.push('is-today');
        if (cell.day === selected) classes.push('is-selected');
        return <button
          key={cell.day}
          type="button"
          role="gridcell"
          className={classes.join(' ')}
          disabled={!count}
          aria-pressed={cell.day === selected}
          aria-label={`${cell.day}${count ? `，${count} 条记录` : '，无记录'}`}
          onClick={() => { if (!count) return; setSelected(cell.day); onOpenDay?.(cell.day); }}
        >
          <span className="tw-diary-daynum">{cell.label}</span>
          {count > 0 && <span className="tw-diary-badge">{count}</span>}
        </button>;
      })}
    </div>
  </section>;
}
