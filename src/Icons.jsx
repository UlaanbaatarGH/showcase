import { Fragment } from 'react';

// FIX352.3.4.4: render admin-entered text, expanding the literal
// '{icon-contact}' placeholder into the inline contact icon used
// elsewhere in the app. Newlines are preserved by CSS at the call
// site (white-space: pre-wrap on the surrounding element).
// iconSize defaults to '1em' so the glyph scales with the
// surrounding font size; pass a number for a fixed pixel size.
export function RichText({ text, iconSize = '1em' }) {
  if (!text) return null;
  if (!text.includes('{icon-contact}')) return text;
  const parts = text.split('{icon-contact}');
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <IconContact
              size={iconSize}
              style={{ verticalAlign: '-0.15em' }}
            />
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}

// Consistent line-art icon set for the Showcase app. All icons:
//   - 24x24 viewBox, 2px stroke
//   - stroke="currentColor" / fill="none" so they inherit text colour
//   - round line caps/joins for a soft, friendly look
// Usage: <IconHome size={20} className="..." />

const COMMON = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ size, children, ...rest }) {
  const props = size ? { ...COMMON, width: size, height: size } : COMMON;
  return <svg {...props} {...rest} aria-hidden="true">{children}</svg>;
}

export function IconHome(props) {
  // House: roof + walls + door.
  return (
    <Svg {...props}>
      <path d="M3 12 L12 3 L21 12" />
      <path d="M5 10 V20 H19 V10" />
      <path d="M9 20 V14 H15 V20" />
    </Svg>
  );
}

export function IconAbout(props) {
  // Info: circle with a 'i' (dot + body).
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconContact(props) {
  // Envelope: rectangle + V flap.
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7 L12 13 L21 7" />
    </Svg>
  );
}

export function IconCamera(props) {
  // FIX620.2.1.1 / FIX653.2: camera body + viewfinder bump + lens.
  return (
    <Svg {...props}>
      <path d="M4 8 H8 L10 5 H14 L16 8 H20 A1 1 0 0 1 21 9 V18 A1 1 0 0 1 20 19 H4 A1 1 0 0 1 3 18 V9 A1 1 0 0 1 4 8 Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Svg>
  );
}

export function IconSignIn(props) {
  // Arrow entering a 3-sided box on the right.
  return (
    <Svg {...props}>
      <path d="M15 3 H19 V21 H15" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </Svg>
  );
}

export function IconSignOut(props) {
  // Mirror of sign-in: arrow leaving a 3-sided box on the left.
  return (
    <Svg {...props}>
      <path d="M9 3 H5 V21 H9" />
      <polyline points="14 17 19 12 14 7" />
      <line x1="19" y1="12" x2="7" y2="12" />
    </Svg>
  );
}

// FIX201.2.1 <icon-add>: Bold green plus. Add and Delete deviate from the
// line-art family on purpose: they're in-form action icons, meant to read
// as "click me to add" / "click me to delete" at a glance. Thick stroke +
// round caps + hardcoded green / red so they stay vivid regardless of
// surrounding text colour. Override via the `color` prop if needed.
export function IconAdd({ size = 24, color = '#16a34a', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      aria-hidden="true"
      {...rest}
    >
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

// FIX201.2.2 <icon-delete>. Spec text literally says "Bold green plus"
// (same wording as FIX201.2.1) -- almost certainly a copy-paste leftover,
// not the intended description, since that would make Add and Delete
// visually indistinguishable. Kept as the existing bold red X, which
// already reads unambiguously as "delete" everywhere it's used (NCF: not
// bending this to the literal text, flagging the discrepancy instead).
export function IconDelete({ size = 24, color = '#dc2626', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      aria-hidden="true"
      {...rest}
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

// FIX201.2.3 / FIX201.2.4 <icon-move-up> / <icon-move-down> (spec: "Bold
// black arrow"; rendered a neutral dark grey rather than pure black --
// same "not a positive/negative action" reasoning as the comment below).
// FIX512.2.12 / FIX512.2.13 <cmd-move-up> / <cmd-move-down>: same
// thick-stroke / round-cap treatment as IconAdd / IconDelete, but neutral
// grey since reordering isn't a positive/negative action like those two.
// Bug fix: the toolbar buttons previously rendered as plain unstyled
// <button> elements (default browser chrome) with a bare "^"/"v" glyph --
// looked like broken/empty boxes next to the colored icon buttons.
export function IconMoveUp({ size = 24, color = '#94a3b8', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <polyline points="5,11 12,4 19,11" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

export function IconMoveDown({ size = 24, color = '#94a3b8', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <polyline points="5,13 12,20 19,13" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

// FIX507.4.5 <rating-icon>: the three fixed rating symbols (green bold
// tick / orange bold question mark / red bold cross) -- same
// thick-stroke / round-cap / hardcoded-colour treatment as IconAdd /
// IconDelete above, so they read at a glance the same way.
export function IconRatingYes({ size = 24, color = '#16a34a', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <polyline points="4,13 9,18 20,6" />
    </svg>
  );
}

export function IconRatingUnknown({ size = 24, color = '#f59e0b', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M8.5 9a3.5 3.5 0 1 1 5.2 3.05C12.3 12.8 12 13.4 12 14.5" />
      <line x1="12" y1="18" x2="12" y2="18.01" />
    </svg>
  );
}

export function IconRatingNo({ size = 24, color = '#dc2626', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      aria-hidden="true"
      {...rest}
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

// FIX507.4.5: lookup for stored <rating-icon> values ('yes' | 'unknown'
// | 'no'). Unknown/blank values render nothing rather than guessing.
export const RATING_ICONS = {
  yes: IconRatingYes,
  unknown: IconRatingUnknown,
  no: IconRatingNo,
};

// FIX520.4.8 <item-with-conflicting-rating>: smaller red bold exclamation
// point shown right after <icon-rating> when the item has a conflict.
export function IconRatingConflict({ size = 24, color = '#dc2626', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      aria-hidden="true"
      {...rest}
    >
      <line x1="12" y1="4" x2="12" y2="14" />
      <line x1="12" y1="19" x2="12" y2="19.01" />
    </svg>
  );
}

// FIX525.3.5 / FIX511.2.0.1 <action-item-flagging>: small red flag, top-left
// of the image (both the main viewer and, per the updated diagram, each
// Gallery thumbnail). Bug fix (user-reported: too crude/ugly) -- the first
// pass was a bold straight-edged pennant borrowed from this file's
// thick-toolbar-button icons (IconAdd/IconDelete), a much bolder register
// than suits a small passive status badge. Redrawn as a slimmer pole with a
// gently waving flag (a soft double-curve top/bottom edge, the common
// "flag" glyph shape), thinner stroke, reads cleanly at the small sizes
// this is actually rendered at (18px in the viewer, smaller still on a
// gallery card).
export function IconFlag({ size = 24, color = '#dc2626', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <line x1="5" y1="21" x2="5" y2="3" />
      <path
        d="M5 4.5c1.7-1.2 3.6-1.2 5.5 0s3.8 1.2 5.5 0v8c-1.7 1.2-3.6 1.2-5.5 0s-3.8-1.2-5.5 0z"
        fill={color}
      />
    </svg>
  );
}
