import { useEffect, useMemo, useState } from 'react';

function getCellValue(folder, col) {
  if (col === 'name') return folder.name ?? '';
  if (col.startsWith('prop_')) return folder.properties?.[col.slice(5)] ?? '';
  return '';
}

function compareValues(a, b) {
  if (a === '' && b === '') return 0;
  if (a === '') return -1;
  if (b === '') return 1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (
    Number.isFinite(aNum) &&
    Number.isFinite(bNum) &&
    String(aNum) === String(a).trim() &&
    String(bNum) === String(b).trim()
  ) {
    return aNum - bNum;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export default function ShowcaseView() {
  const [data, setData] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [images, setImages] = useState([]);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [error, setError] = useState(null);
  const [sortKeys, setSortKeys] = useState([]); // [{ col, dir }]
  const [filters, setFilters] = useState({}); // { col: text }

  useEffect(() => {
    fetch('/api/showcase')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        setData(d);
        if (d.folders?.length) setSelectedFolderId(d.folders[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (selectedFolderId == null) return;
    setImages([]);
    fetch(`/api/folders/${selectedFolderId}/images`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((imgs) => {
        setImages(imgs);
        const mainIdx = imgs.findIndex((i) => i.is_main);
        setCurrentImageIdx(mainIdx >= 0 ? mainIdx : 0);
      })
      .catch((e) => setError(String(e)));
  }, [selectedFolderId]);

  const displayedFolders = useMemo(() => {
    if (!data) return [];
    let rows = data.folders;
    const activeFilters = Object.entries(filters).filter(([, v]) => v && v.trim());
    if (activeFilters.length > 0) {
      rows = rows.filter((f) =>
        activeFilters.every(([col, v]) =>
          String(getCellValue(f, col))
            .toLowerCase()
            .includes(v.trim().toLowerCase()),
        ),
      );
    }
    if (sortKeys.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { col, dir } of sortKeys) {
          const cmp = compareValues(getCellValue(a, col), getCellValue(b, col));
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
    }
    return rows;
  }, [data, filters, sortKeys]);

  const handleHeaderClick = (col, ctrl) => {
    setSortKeys((keys) => {
      const idx = keys.findIndex((k) => k.col === col);
      if (ctrl) {
        if (idx >= 0) {
          const updated = [...keys];
          updated[idx] = { col, dir: keys[idx].dir === 'asc' ? 'desc' : 'asc' };
          return updated;
        }
        return [...keys, { col, dir: 'asc' }];
      }
      if (idx === 0 && keys.length === 1) {
        if (keys[0].dir === 'asc') return [{ col, dir: 'desc' }];
        return [];
      }
      return [{ col, dir: 'asc' }];
    });
  };

  const sortIndicator = (col) => {
    const idx = sortKeys.findIndex((k) => k.col === col);
    if (idx < 0) return '';
    const arrow = sortKeys[idx].dir === 'asc' ? '▲' : '▼';
    return sortKeys.length > 1 ? `${arrow}${idx + 1}` : arrow;
  };

  const setFilter = (col, v) => {
    setFilters((prev) => ({ ...prev, [col]: v }));
  };

  if (error) return <div className="sc-error">Error: {error}</div>;
  if (!data) return <div className="sc-loading">Loading…</div>;

  const currentImage = images[currentImageIdx];
  const properties = data.properties ?? [];
  const columns = [
    { col: 'name', label: 'Folder name' },
    ...properties.map((p) => ({ col: `prop_${p.id}`, label: p.label })),
  ];

  return (
    <div className="sc-layout">
      <header className="sc-header">
        <h1>{data.project?.name ?? 'Showcase'}</h1>
      </header>
      <div className="sc-main">
        <section className="sc-list-panel">
          <table className="sc-table">
            <thead>
              <tr>
                <th className="sc-th-thumb" aria-label="Main image" />
                {columns.map((c) => (
                  <th key={c.col}>
                    <button
                      type="button"
                      className="sc-sort-btn"
                      onClick={(e) =>
                        handleHeaderClick(c.col, e.ctrlKey || e.metaKey)
                      }
                      title="Click to sort. Ctrl-click to add a secondary sort key."
                    >
                      <span>{c.label}</span>
                      <span className="sc-sort-arrow">{sortIndicator(c.col)}</span>
                    </button>
                    <input
                      type="text"
                      className="sc-filter-input"
                      value={filters[c.col] ?? ''}
                      onChange={(e) => setFilter(c.col, e.target.value)}
                      placeholder="Filter"
                      aria-label={`Filter ${c.label}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedFolders.map((f) => (
                <tr
                  key={f.id}
                  className={f.id === selectedFolderId ? 'selected' : ''}
                  onClick={() => setSelectedFolderId(f.id)}
                >
                  <td className="sc-td-thumb">
                    {f.main_image_url ? (
                      <img
                        src={f.main_image_url}
                        alt=""
                        style={
                          f.main_rotation
                            ? { transform: `rotate(${f.main_rotation}deg)` }
                            : undefined
                        }
                      />
                    ) : (
                      <div className="sc-td-thumb-empty" />
                    )}
                  </td>
                  <td className="sc-td-name">{f.name}</td>
                  {properties.map((p) => (
                    <td key={p.id}>{f.properties?.[String(p.id)] ?? '—'}</td>
                  ))}
                </tr>
              ))}
              {displayedFolders.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="sc-empty">
                    No folders match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="sc-viewer">
          {currentImage ? (
            <>
              <img
                src={currentImage.url}
                alt={currentImage.caption ?? ''}
                className="sc-viewer-img"
                style={
                  currentImage.rotation
                    ? { transform: `rotate(${currentImage.rotation}deg)` }
                    : undefined
                }
              />
              {currentImage.caption && (
                <div className="sc-viewer-caption">{currentImage.caption}</div>
              )}
              <div className="sc-viewer-nav">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIdx((i) => Math.max(0, i - 1))
                  }
                  disabled={currentImageIdx === 0}
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <span className="sc-viewer-pos">
                  {currentImageIdx + 1} / {images.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIdx((i) =>
                      Math.min(images.length - 1, i + 1),
                    )
                  }
                  disabled={currentImageIdx >= images.length - 1}
                  aria-label="Next image"
                >
                  ›
                </button>
              </div>
            </>
          ) : (
            <div className="sc-viewer-empty">No images in this folder.</div>
          )}
        </section>
      </div>
    </div>
  );
}
