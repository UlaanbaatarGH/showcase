import { useEffect, useRef, useState } from 'react';
import { getShowcase, setMyRating } from './data/backend.js';
import { ProjectHeaderLeft, ProjectHeaderRight } from './ProjectHeader.jsx';
import { RATING_ICONS, IconRatingConflict } from './Icons.jsx';
import ItemDetailsPanel from './ItemDetailsPanel.jsx';

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
  // FIX702.3.3: which image in <panel-rated-images> is selected — no
  // FTag defines the click-to-select itself (none numbered between
  // FIX702.3.1 and FIX702.3.3), but the keyboard shortcuts need a
  // target, same as <panel-item>'s own selectedFolderId.
  const [selectedItemId, setSelectedItemId] = useState(null);
  // FIX702.2.10: slidable vertical splitter between <panel-rated-images>
  // and <panel-item-details> — same drag-resize mechanics as
  // CatalogueView.jsx's list/viewer splitter (own localStorage key,
  // own state), mirrored since the resizable panel sits on the right
  // here instead of the left.
  const [detailsWidth, setDetailsWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sc-my-ratings-details-width'));
    return Number.isFinite(saved) && saved > 200 ? saved : 360;
  });
  const mainRef = useRef(null);
  const onSplitterDown = (e) => {
    e.preventDefault();
    const mainRect = mainRef.current?.getBoundingClientRect();
    const startX = e.clientX;
    const startW = detailsWidth;
    const minImages = 240;
    const minDetails = 240;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const maxDetails = (mainRect?.width ?? 1200) - minImages - 6;
      // Dragging right shrinks the details panel — it's anchored to the
      // right edge here, the opposite relationship from CatalogueView's
      // list (left-anchored, grows when dragged right).
      const next = Math.max(minDetails, Math.min(maxDetails, startW - dx));
      setDetailsWidth(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      try { localStorage.setItem('sc-my-ratings-details-width', String(detailsWidth)); }
      catch { /* ignore */ }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setSelectedRatingKey(null);
    setSelectedItemId(null);
    getShowcase(slug)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message || String(e)); });
    return () => { cancelled = true; };
  }, [slug]);

  // FIX702.3.3 / FIX702.3.3.1: set (ratingValueId) or clear (null, the
  // '0' key) the selected image's rating — same digit-key convention
  // (0 clears, N picks the Nth <table-rating-values> row) and the same
  // optimistic-update-with-silent-revert-on-failure as CatalogueView's
  // handleSetMyRating (no error message is spec'd for a rejected
  // rating here either). FIX702.3.3.1's three consequences are handled
  // as follows once my_rating_value_id changes locally:
  //   - "removes the image from the current list": automatic —
  //     selectedFolders re-filters by my_rating_value_id.
  //   - "reassess the number of items for each rating": automatic —
  //     ratingBuckets re-derives its counts from folders.
  //   - "reassess the conflicts for this image": has_rating_conflict is
  //     computed server-side against every rater's score, not just the
  //     caller's — a silent background re-fetch (no loading flash,
  //     data only swapped once it lands) picks up the recomputed flag
  //     for every item, not just this one.
  const handleSetRating = (folderId, ratingValueId) => {
    const prevFolder = (data?.folders ?? []).find((f) => f.id === folderId);
    const prevRatingValueId = prevFolder?.my_rating_value_id ?? null;
    setData((prev) => ({
      ...prev,
      folders: (prev.folders ?? []).map((f) => (
        f.id === folderId ? { ...f, my_rating_value_id: ratingValueId } : f
      )),
    }));
    setMyRating(folderId, ratingValueId)
      .then(() => getShowcase(slug).then((d) => setData(d)).catch(() => {}))
      .catch(() => {
        setData((prev) => ({
          ...prev,
          folders: (prev.folders ?? []).map((f) => (
            f.id === folderId ? { ...f, my_rating_value_id: prevRatingValueId } : f
          )),
        }));
      });
  };

  useEffect(() => {
    const onKey = (e) => {
      const ae = document.activeElement;
      const tag = ae?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae?.isContentEditable;
      if (editable || !ratingEnabled || selectedItemId == null || !/^[0-9]$/.test(e.key)) return;
      e.preventDefault();
      if (e.key === '0') {
        handleSetRating(selectedItemId, null);
      } else {
        const rv = (data?.rating_setup?.values ?? [])[Number(e.key) - 1];
        if (rv) handleSetRating(selectedItemId, rv.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId, ratingEnabled, data]);

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

  // FIX702.2.3 <panel-item-details>: same ItemDetailsPanel.jsx
  // CatalogueView.jsx's Details tab uses (FIX518, extracted out so
  // this is a real reuse, not a duplicate) — view-mode only, no
  // edit-mode props passed since My ratings has no edit affordance.
  const properties = data?.properties ?? [];
  const propertiesByLabel = new Map(properties.map((p) => [p.label, p]));
  const deletedPropertyId = data?.view_setup?.item_filters?.deleted_property_id ?? null;
  const folderColumnName = data?.view_setup?.showcase?.folder_column_name || '#';
  const selectedItemFolder = folders.find((f) => f.id === selectedItemId) ?? null;

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
      {/* FIX702 / FIX702.0 <panel-my-ratings-content> / FIX702.2.0
          (updated): three columns — ratings list, checked image
          pattern, item details — the last two split by a slidable
          splitter (FIX702.2.10). */}
      <div className="sc-my-ratings-content" data-yagu-id="panel-my-ratings-content" ref={mainRef}>
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
                // FIX702.3.2 (updated): click selects the image and
                // opens/refreshes <panel-item-details> below — the
                // latter is automatic, ItemDetailsPanel re-renders off
                // selectedItemFolder whenever selectedItemId changes.
                // FIX702.3.3: selecting also enables the 0-9 keyboard
                // rating shortcuts.
                <div
                  key={f.id}
                  className={`sc-rated-image-cell${f.id === selectedItemId ? ' selected' : ''}`}
                  onClick={() => setSelectedItemId(f.id)}
                >
                  {/* FIX702.4.5: the thumbnail created at image import or
                      publication (FIX371.6.2.1 / FIX670.20.4), falling
                      back to the full image for items from before
                      thumbnails existed. */}
                  <img
                    src={f.main_image_thumb_url || f.main_image_url}
                    alt={f.name}
                    loading="lazy"
                    onError={(e) => {
                      if (e.target.src !== f.main_image_url) e.target.src = f.main_image_url;
                    }}
                  />
                  {/* FIX702.4.4 + FIX702.4.3 (updated): caption row below
                      the image — item ref (folder.name), white, centred
                      (FIX702.4.4), with a conflicting rating's red bold
                      exclamation point (same has_rating_conflict flag +
                      icon as the Catalogue viewer's <icon-rating>,
                      FIX520.4.8) at the right of the ref, separated by a
                      space. */}
                  <div className="sc-rated-image-caption">
                    {f.name}
                    {f.has_rating_conflict && (
                      <>
                        {' '}
                        <IconRatingConflict size={14} className="sc-rated-image-conflict" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </section>
            {/* FIX702.2.10: slidable vertical splitter between
                <panel-rated-images> and <panel-item-details>, same
                drag mechanics as CatalogueView.jsx's list/viewer one. */}
            <div
              className="sc-splitter"
              onMouseDown={onSplitterDown}
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
            />
            {/* FIX702.2.3 + .2.3.0 <panel-item-details>: existing panel
                (FIX518), reused via ItemDetailsPanel.jsx. View-mode
                only — no edition affordance defined for My ratings. */}
            <section className="sc-viewer sc-my-ratings-details" style={{ width: detailsWidth, flex: '0 0 auto' }}>
              <ItemDetailsPanel
                folder={selectedItemFolder}
                folders={folders}
                properties={properties}
                propertiesByLabel={propertiesByLabel}
                deletedPropertyId={deletedPropertyId}
                folderColumnName={folderColumnName}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
