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

// Add and Delete deviate from the line-art family on purpose: they're
// in-form action icons, meant to read as "click me to add" / "click me
// to delete" at a glance. Thick stroke + round caps + hardcoded
// green / red so they stay vivid regardless of surrounding text colour.
// Override via the `color` prop if needed.
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
