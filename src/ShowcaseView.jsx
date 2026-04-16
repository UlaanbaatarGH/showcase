import { useEffect, useState } from 'react';

export default function ShowcaseView() {
  const [data, setData] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [images, setImages] = useState([]);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [error, setError] = useState(null);

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

  if (error) return <div className="sc-error">Error: {error}</div>;
  if (!data) return <div className="sc-loading">Loading…</div>;

  const currentImage = images[currentImageIdx];
  const properties = data.properties ?? [];

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
                <th>Folder name</th>
                {properties.map((p) => (
                  <th key={p.id}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.folders.map((f) => (
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
