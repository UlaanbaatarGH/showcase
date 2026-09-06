import { parseCaptionMarkup } from '../properties/imgCaption.js';

// Shared by both renderers below: one run's text wrapped in b/i/u and a
// style covering height (px) and colour only where that run's tags set them.
function renderRun(r, key) {
  const style = {};
  if (r.heightPx) style.fontSize = `${r.heightPx}px`;
  if (r.color) style.color = r.color;
  let node = r.text;
  if (r.bold) node = <b>{node}</b>;
  if (r.italic) node = <i>{node}</i>;
  if (r.underline) node = <u>{node}</u>;
  return <span key={key} style={style}>{node}</span>;
}

// FIX512.4.6 / FIX512.4.7: renders a resolved caption (parseCaptionMarkup's
// lines-of-styled-runs) as one <div> per line -- each a plain block, so
// stacking doesn't depend on any CSS white-space handling of '\n'. Shared by
// CatalogueView.jsx's read-only viewers and ShowcaseImgListEditor.jsx's
// backoffice caption preview, so a caption formula renders identically
// everywhere it's shown.
export default function CaptionMarkup({ text }) {
  return parseCaptionMarkup(text).map((runs, li) => (
    <div key={li}>{runs.map((r, ri) => renderRun(r, ri))}</div>
  ));
}

// FIX511.2.3/.2.4/.2.5: the Gallery thumbnail caption is documented as ONE
// centred line that also carries a trailing rating/conflict icon inline
// after the text -- CaptionMarkup's per-line <div> is a block box that would
// push those icons onto their own line below it, so this renders the same
// styled runs as a flat inline sequence (line breaks as <br/>) instead.
export function renderCaptionRuns(text) {
  const nodes = [];
  parseCaptionMarkup(text).forEach((runs, li) => {
    if (li > 0) nodes.push(<br key={`br${li}`} />);
    runs.forEach((r, ri) => nodes.push(renderRun(r, `${li}-${ri}`)));
  });
  return nodes;
}
