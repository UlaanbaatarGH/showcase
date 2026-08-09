import { useEffect, useState } from 'react';
import { getShowcase } from './data/backend.js';
import { ProjectHeaderLeft, ProjectHeaderRight } from './ProjectHeader.jsx';

// FIX700 <view-my-ratings>: give a visual view of the items the user has
// rated. FIX702.2 ('UI Layout: blank screen') means the content panel is
// intentionally a placeholder for now — a later topic fills it in.
//
// Deliberately its own file/component rather than a mode flag inside
// CatalogueView.jsx (per direct instruction to keep the two views
// clearly separate) — it does its own lightweight getShowcase(slug)
// fetch (same call CatalogueView.jsx makes) rather than sharing already-
// loaded data, since the two views are siblings that are never mounted
// at the same time (App.jsx renders one or the other). The only shared
// code is the header (ProjectHeaderLeft/Right, see ProjectHeader.jsx).
export default function MyRatingsView({ slug, onNavigateHome, currentView, onSwitchView }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getShowcase(slug)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message || String(e)); });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    // FIX700.0 <view-my-ratings>: reuses <panel-project-home> (FIX401.0)
    // rather than defining a separate Id — same shared-container-Id
    // pattern CatalogueView.jsx's <view-catalogue> (FIX502.0) uses.
    <div className="sc-layout" data-yagu-id="panel-project-home">
      {/* FIX701 / FIX701.0 <panel-my-ratings-header>: just the shared
          Home/name/View-menu/user/sign-out cluster — no Columns/
          Grouping/Import/Admin/Setup, matching FIX701.2's leaner
          layout diagram. */}
      <div className="sc-topbar" data-yagu-id="panel-my-ratings-header">
        <ProjectHeaderLeft
          projectName={data?.project?.name}
          onNavigateHome={onNavigateHome}
          currentView={currentView}
          onSwitchView={onSwitchView}
        />
        <span className="sc-topbar-spacer" />
        <ProjectHeaderRight />
      </div>
      {error && <div className="sc-viewer-err">{error}</div>}
      {/* FIX702 / FIX702.0 <panel-my-ratings-content> / FIX702.2: blank
          screen — placeholder until a later topic defines the content. */}
      <div className="sc-my-ratings-content" data-yagu-id="panel-my-ratings-content" />
    </div>
  );
}
