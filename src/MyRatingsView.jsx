import { useEffect, useState } from 'react';
import { getShowcase } from './data/backend.js';
import { ProjectHeaderLeft, ProjectHeaderRight } from './ProjectHeader.jsx';
import { RATING_ICONS, IconRatingConflict } from './Icons.jsx';

// FIX700 <view-my-ratings>: give a visual view of the items the user has
// rated. Deliberately its own file/component rather than a mode flag
// inside CatalogueView.jsx (per direct instruction to keep the two
// views clearly separate) — the only shared code is the header
// (ProjectHeaderLeft/Right, see ProjectHeader.jsx).
//
// Does its own getShowcase(slug) fetch (same call CatalogueView.jsx
// makes — siblings, never mounted together, so there's nothing to
// share) but — unlike CatalogueView's data fetch, which used to blank
// the whole header while loading — always renders the header
// immediately from the cached `projectName` prop (see App.jsx) and
// only the content area shows its own loading state, so switching
// into this view never bumps Home/name/menu-view/user.
export default function MyRatingsView({ slug, projectName, ratingEnabled, isRegisteredRater, onNavigateHome, currentView, onSwitchView }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // FIX702.3.1: which rating (by rating_value id, or 'novalue') is
  // currently selected in <panel-ratings-list>. Nothing selected by
  // default — the spec only defines what happens on click, not an
  // initial auto-selection.
  const [selectedRatingKey, setSelectedRatingKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setSelectedRatingKey(null);
    getShowcase(slug)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message || String(e)); });
    return () => { cancelled = true; };
  }, [slug]);

  // FIX702.2.1: "It is the Grouping for My Ratings without the Grouping
  // name" — the same auto-managed 'My basket' grouping (FIX373.5.1,
  // property_id 'rating') CatalogueView's own grouping panel uses, just
  // without its 'My basket' title and built directly off rating_setup's
  // own order (not the generic bucketsWithValues() sort-by-label, which
  // would reorder by rating_value id instead of the admin-defined
  // rating order).
  const folders = data?.folders ?? [];
  // FIX702.4.1: listed by *decreasing* index in <table-rating-values> —
  // rating_setup.values already comes back sort_order-ascending (same
  // order the Rating setup tab and CatalogueView's own grouping use), so
  // this reverses it for display here specifically.
  const ratingValues = [...(data?.rating_setup?.values ?? [])].reverse();
  const ratingBuckets = (() => {
    const counts = new Map();
    let noValueCount = 0;
    for (const f of folders) {
      if (f.my_rating_value_id == null) noValueCount += 1;
      else counts.set(f.my_rating_value_id, (counts.get(f.my_rating_value_id) || 0) + 1);
    }
    // FIX702.4.2: every defined rating value is listed even with a 0
    // count (no .filter() here, unlike the 'No value' catch-all below,
    // which isn't one of <table-rating-values>'s own entries and stays
    // hidden when nothing is unrated).
    const list = ratingValues
      .map((v) => ({ key: String(v.id), ratingValueId: v.id, icon: v.icon, count: counts.get(v.id) || 0 }));
    if (noValueCount > 0) {
      list.push({ key: 'novalue', ratingValueId: null, icon: null, count: noValueCount, noValue: true });
    }
    return list;
  })();

  // FIX702.3.1: items carrying the selected rating, in their existing
  // display order — only ones with an actual image are shown (nothing
  // to display otherwise), matching FIX702.2.2.1's "list of images".
  const selectedFolders = selectedRatingKey == null ? [] : folders.filter((f) => (
    selectedRatingKey === 'novalue'
      ? f.my_rating_value_id == null
      : String(f.my_rating_value_id) === selectedRatingKey
  ) && f.main_image_url);

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
          ratingEnabled={ratingEnabled}
          isRegisteredRater={isRegisteredRater}
        />
        <span className="sc-topbar-spacer" />
        <ProjectHeaderRight />
      </div>
      {/* FIX702 / FIX702.0 <panel-my-ratings-content> / FIX702.2.0. */}
      <div className="sc-my-ratings-content" data-yagu-id="panel-my-ratings-content">
        {error && <div className="sc-viewer-err">{error}</div>}
        {!data && !error && <div className="sc-catalogue-loading">Loading…</div>}
        {data && (
          <>
            {/* FIX702.2.1 + .2.1.0 + .2.1.1 <panel-ratings-list>: reuses
                the grouping side-panel's exact pill styling
                (.sc-groups-panel/.sc-buckets) for visual consistency
                with the 'My basket' grouping it's built from. */}
            <section className="sc-groups-panel sc-ratings-list" data-yagu-id="panel-ratings-list">
              <ul className="sc-buckets">
                {ratingBuckets.map((b) => {
                  const RatingIconComp = b.icon ? RATING_ICONS[b.icon] : null;
                  return (
                    <li
                      key={b.key}
                      className={[
                        b.key === selectedRatingKey ? 'selected' : '',
                        b.noValue ? 'novalue' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelectedRatingKey(b.key === selectedRatingKey ? null : b.key)}
                    >
                      {RatingIconComp ? <RatingIconComp size={16} /> : 'No value'}
                      {' '}
                      <span className="sc-bucket-count">({b.count})</span>
                    </li>
                  );
                })}
                {ratingBuckets.length === 0 && (
                  <li className="sc-buckets-empty">(no ratings yet)</li>
                )}
              </ul>
            </section>
            {/* FIX702.2.2 + .2.2.0 + .2.2.1 + .2.2.2 <panel-rated-images>:
                first image of every item carrying the selected rating,
                in a checked (grid) pattern with a vertical scrollbar. */}
            <section className="sc-rated-images" data-yagu-id="panel-rated-images">
              {selectedFolders.map((f) => (
                <div key={f.id} className="sc-rated-image-cell">
                  <img src={f.main_image_url} alt={f.name} loading="lazy" />
                  {/* FIX702.4.3 <item-with-conflicting-rating>: red bold
                      exclamation point, top right corner of the image —
                      same has_rating_conflict flag + icon the Catalogue
                      viewer's <icon-rating> already uses (FIX520.4.8),
                      just positioned as an image overlay here instead
                      of inline next to a rating icon. */}
                  {f.has_rating_conflict && (
                    <IconRatingConflict size={18} className="sc-rated-image-conflict" />
                  )}
                  {/* FIX702.4.4: item ref (folder.name), white, centred,
                      below the image. */}
                  <div className="sc-rated-image-ref">{f.name}</div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
