'use client';

// [2026-04-20] Rewrite: pure React visual mindmap renderer
// Replaces markmap-lib/view dynamic import (caused plain-text display bug in Next.js)
// Parses # ## ### heading hierarchy → color-coded node tree
// [2026-04-23] Add zoom (wheel) + drag (pan) interaction

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

interface MeetingMindmapProps {
  markdown: string;
}

interface MindNode {
  text: string;
  level: number;          // 1 = root, 2 = branch, 3 = leaf
  children: MindNode[];
}

// ── Markdown → Tree ───────────────────────────────────────────────────────────
function parseMarkdown(md: string): MindNode {
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const root: MindNode = { text: '', level: 0, children: [] };
  const stack: MindNode[] = [root];

  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    const node: MindNode = { text, level, children: [] };

    // Find the parent: last node whose level is < current level
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  // If only one root child, promote it
  return root.children[0] ?? root;
}

// ── Node colors by level ──────────────────────────────────────────────────────
const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-blue-600 text-white font-bold text-base shadow-lg shadow-blue-900/50',
  2: 'bg-indigo-700/80 text-indigo-100 font-semibold text-sm',
  3: 'bg-gray-700/70 text-gray-200 text-xs',
  4: 'bg-gray-800/60 text-gray-400 text-xs',
};

const CONNECTOR_COLORS: Record<number, string> = {
  2: 'border-indigo-500/50',
  3: 'border-gray-600/50',
  4: 'border-gray-700/40',
};

// ── Leaf node ─────────────────────────────────────────────────────────────────
function LeafNode({ node }: { node: MindNode }) {
  const color = LEVEL_COLORS[node.level] ?? LEVEL_COLORS[4];
  const connColor = CONNECTOR_COLORS[node.level] ?? CONNECTOR_COLORS[4];

  if (node.children.length === 0) {
    return (
      <div className="flex items-center gap-1.5 my-0.5">
        <div className={`w-1.5 h-px border-t ${connColor} shrink-0`} style={{ width: 12 }} />
        <span className={`px-2 py-0.5 rounded-md ${color}`}>{node.text}</span>
      </div>
    );
  }

  return (
    <div className="my-1">
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-3 h-px border-t ${connColor} shrink-0`} />
        <span className={`px-2 py-0.5 rounded-md ${color}`}>{node.text}</span>
      </div>
      <div className="ml-5 pl-3 border-l border-gray-700/40">
        {node.children.map((child, i) => (
          <LeafNode key={i} node={child} />
        ))}
      </div>
    </div>
  );
}

// ── Branch card ───────────────────────────────────────────────────────────────
function BranchCard({ node }: { node: MindNode }) {
  const branchColors = [
    { bg: 'bg-blue-900/30 border-blue-500/40',    title: 'text-blue-300' },
    { bg: 'bg-purple-900/30 border-purple-500/40', title: 'text-purple-300' },
    { bg: 'bg-teal-900/30 border-teal-500/40',    title: 'text-teal-300' },
    { bg: 'bg-amber-900/30 border-amber-500/40',  title: 'text-amber-300' },
    { bg: 'bg-rose-900/30 border-rose-500/40',    title: 'text-rose-300' },
    { bg: 'bg-cyan-900/30 border-cyan-500/40',    title: 'text-cyan-300' },
  ];
  // Stable color per node text hash
  const colorIdx = node.text.length % branchColors.length;
  const c = branchColors[colorIdx];

  return (
    <div className={`rounded-xl border p-3 min-w-[160px] max-w-[260px] ${c.bg}`}>
      <p className={`font-semibold text-sm mb-2 ${c.title}`}>{node.text}</p>
      {node.children.length > 0 && (
        <div className="space-y-0.5">
          {node.children.map((child, i) => (
            <LeafNode key={i} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MeetingMindmap({ markdown }: MeetingMindmapProps) {
  const { t } = useTranslation();
  const tree = useMemo(() => parseMarkdown(markdown), [markdown]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Wheel zoom
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(3, Math.max(0.3, s - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Drag to pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onReset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  if (!tree || !tree.text) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        {t('meeting_view.mindmap_no_data')}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl bg-gray-900/60 border border-gray-700/50 overflow-hidden"
      style={{ minHeight: 320, cursor: dragging.current ? 'grabbing' : 'grab', userSelect: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))}
          className="w-7 h-7 rounded-lg bg-gray-700/80 hover:bg-gray-600 text-white text-sm flex items-center justify-center select-none"
        >+</button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setScale((s) => Math.max(0.3, +(s - 0.2).toFixed(1)))}
          className="w-7 h-7 rounded-lg bg-gray-700/80 hover:bg-gray-600 text-white text-sm flex items-center justify-center select-none"
        >−</button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onReset}
          className="h-7 px-2 rounded-lg bg-gray-700/80 hover:bg-gray-600 text-gray-300 text-xs select-none"
        >↺</button>
        <span className="text-xs text-gray-500 select-none">{Math.round(scale * 100)}%</span>
      </div>

      {/* Zoomable / pannable canvas */}
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center top',
          transition: dragging.current ? 'none' : 'transform 0.05s',
          padding: '1.5rem',
        }}
      >
        {/* Root node */}
        <div className="flex flex-col items-center mb-8">
          <div className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-bold text-lg shadow-xl shadow-blue-900/50 text-center max-w-xs">
            {tree.text}
          </div>
        </div>

        {tree.children.length > 0 && (
          <>
            {/* Connector line from root */}
            <div className="flex justify-center mb-0">
              <div className="w-px h-4 bg-blue-500/40" />
            </div>

            {/* Branch grid */}
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              {tree.children.map((branch, i) => (
                <div key={i} className="flex flex-col items-center gap-0">
                  {/* Connector to branch */}
                  <div className="w-px h-4 bg-blue-500/30" />
                  <BranchCard node={branch} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Hint */}
      <div className="absolute bottom-2 left-3 text-[10px] text-gray-600 select-none pointer-events-none">
        {t('meeting_view.mindmap_zoom_hint')}
      </div>
    </div>
  );
}
