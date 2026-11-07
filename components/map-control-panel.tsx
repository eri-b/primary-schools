'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Minus } from 'lucide-react';

export function MapControlPanel({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const toggleLabel = collapsed ? 'Expand search and filters' : 'Minimize search and filters';

  return (
    <aside className="control-panel" data-collapsed={collapsed} aria-label="Search and map controls">
      {collapsed && <span className="control-panel-label">Search &amp; filters</span>}
      <button
        type="button"
        className="control-panel-toggle"
        aria-expanded={!collapsed}
        aria-controls={contentId}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? <ChevronDown size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
      </button>
      <div id={contentId} className="control-panel-content" hidden={collapsed}>
        {children}
      </div>
    </aside>
  );
}
