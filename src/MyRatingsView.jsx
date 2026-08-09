import { ProjectHeaderLeft, ProjectHeaderRight } from './ProjectHeader.jsx';

// FIX700 <view-my-ratings>: give a visual view of the items the user has
// rated. FIX702.2 ('UI Layout: blank screen') means the content panel is
// intentionally a placeholder for now — a later topic fills it in.
//
// Deliberately its own file/component rather than a mode flag inside
// CatalogueView.jsx (per direct instruction to keep the two views
// clearly separate). Takes `projectName` as a prop from App.jsx instead
// of fetching its own copy of the project — App.jsx caches it from
// CatalogueView's fetch, which already runs first (that's the default
// view). Fetching independently here used to blank the header
// (Home/name/View-menu/user) back to a loading state on every switch
// into this view, visibly bumping it; there's nothing else this view
// needs from the network yet since FIX702.2's content is still blank.
// The only shared code with CatalogueView.jsx is the header
// (ProjectHeaderLeft/Right, see ProjectHeader.jsx).
export default function MyRatingsView({ projectName, onNavigateHome, currentView, onSwitchView }) {
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
          projectName={projectName}
          onNavigateHome={onNavigateHome}
          currentView={currentView}
          onSwitchView={onSwitchView}
        />
        <span className="sc-topbar-spacer" />
        <ProjectHeaderRight />
      </div>
      {/* FIX702 / FIX702.0 <panel-my-ratings-content> / FIX702.2: blank
          screen — placeholder until a later topic defines the content. */}
      <div className="sc-my-ratings-content" data-yagu-id="panel-my-ratings-content" />
    </div>
  );
}
