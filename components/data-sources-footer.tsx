'use client';

import { useRef, type ReactNode } from 'react';

export function DataSourcesFooter({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div className="panel-footer">
      <button type="button" className="panel-footer-link" onClick={() => dialogRef.current?.showModal()}>
        Data sources
      </button>
      <span aria-hidden="true">·</span>
      <a href="https://unfoundedlabs.com" target="_blank" rel="noopener noreferrer">
        Unfounded Labs
      </a>
      <dialog ref={dialogRef} className="data-sources-dialog" aria-labelledby="data-sources-title">
        <div className="data-sources-header">
          <h2 id="data-sources-title">Data sources</h2>
          <button type="button" className="data-sources-close" onClick={() => dialogRef.current?.close()} aria-label="Close data sources">
            ×
          </button>
        </div>
        <div className="data-sources-content">{children}</div>
      </dialog>
    </div>
  );
}
