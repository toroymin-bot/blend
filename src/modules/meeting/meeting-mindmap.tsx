'use client';

// [2026-04-16] New component: Mindmap visualization for meeting analysis results
// Uses markmap-lib + markmap-view for zoom/drag interactive mindmap rendering

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface MeetingMindmapProps {
  markdown: string;
}

export function MeetingMindmap({ markdown }: MeetingMindmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!markdown || !svgRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    async function render() {
      try {
        // Dynamic import to keep static-export compat (markmap-lib/view are ESM-only)
        const { Transformer } = await import('markmap-lib');
        const { Markmap, loadCSS, loadJS } = await import('markmap-view');

        if (cancelled || !svgRef.current) return;

        const transformer = new Transformer();
        const { root, features } = transformer.transform(markdown);

        const { styles, scripts } = transformer.getUsedAssets(features);
        if (styles) loadCSS(styles);
        if (scripts) await loadJS(scripts, { getMarkmap: () => ({ Markmap }) });

        if (cancelled || !svgRef.current) return;

        // Clear previous render
        svgRef.current.innerHTML = '';
        Markmap.create(svgRef.current, undefined, root);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Mindmap render failed');
          setLoading(false);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [markdown]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-surface-2 border border-border-token" style={{ minHeight: '400px' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 size={24} className="animate-spin text-blue-400" />
        </div>
      )}
      <svg
        ref={svgRef}
        className="w-full"
        style={{ minHeight: '400px', opacity: loading ? 0 : 1, transition: 'opacity 0.3s' }}
      />
    </div>
  );
}
