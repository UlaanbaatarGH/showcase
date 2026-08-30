import { parseCaptionMarkup } from '../properties/imgCaption.js';

// FIX512.4.6 / FIX512.4.7: renders a resolved caption (parseCaptionMarkup's
// lines-of-styled-runs) as one <div> per line -- each a plain block, so
// stacking doesn't depend on any CSS white-space handling of '\n' -- with
// each run wrapped in b/i/u and a style covering height (px) and colour
// only where that run's tags set them. Shared by CatalogueView.jsx's
// read-only viewers and ShowcaseImgListEditor.jsx's backoffice caption
// preview, so a caption formula renders identically everywhere it's shown.
export default function CaptionMarkup({ text }) {
  return parseCaptionMarkup(text).map((runs, li) => (
    <div key={li}>
      {runs.map((r, ri) => {
        const style = {};
        if (r.heightPx) style.fontSize = `${r.heightPx}px`;
        if (r.color) style.color = r.color;
        let node = r.text;
        if (r.bold) node = <b>{node}</b>;
        if (r.italic) node = <i>{node}</i>;
        if (r.underline) node = <u>{node}</u>;
        return <span key={ri} style={style}>{node}</span>;
      })}
    </div>
  ));
}
