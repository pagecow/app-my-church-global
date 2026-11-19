/**
 * A church's own colour, and the four shades the phone apps paint with.
 *
 * A church may pick one colour in the dashboard ("Logo and colors"). It is stored
 * as `apps.theme_color` ("#rrggbb", or NULL for the standard blue) and reaches the
 * apps as the optional field `theme_color` of a church. From that one colour this
 * file works out everything the app needs, so the dashboard's preview and the two
 * apps can never disagree.
 *
 * The same file lives in three places and must stay identical in all of them:
 *   app-my-church/lib/accent.ts
 *   app-my-church-global/lib/accent.ts
 *   amc-central-community-church/lib/accent.ts
 * It imports nothing, so each project's tests can run it as it is.
 */

export type Accent = {
  /** Filled buttons, the selected tab, small marks. White text sits on it. */
  azure: string;
  /** Coloured words and icons on white or on the grey page. */
  azureText: string;
  /** A pale wash: the "Share App" button, a selected day, a chosen option. */
  azureTint: string;
  /** Words and icons on that wash. */
  azureTintText: string;
};

/** The standard blue, used by every church that has not picked a colour. */
export const DEFAULT_COLOR = '#0071e3';

export const DEFAULT_ACCENT: Accent = Object.freeze({
  azure: '#0071e3',
  azureText: '#0066cc',
  azureTint: '#e6f0fc',
  azureTintText: '#0058b0',
});

const WHITE = '#ffffff';
/** The grey page behind the cards (`colors.page` in the apps). */
const PAGE = '#f5f5f7';

/** How readable each shade must be (WCAG contrast). The standard blue meets these. */
const ON_SOLID = 4.5;
const TEXT_ON_PAGE = 5;
const TEXT_ON_WASH = 5.5;
/** A wash has to be seen against a white card. */
const WASH_VISIBLE = 1.12;

type Rgb = [number, number, number];

/** "#abc", "ABC", "#AABBCC" or "aabbcc" becomes "#aabbcc". Anything else is null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

const toRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: Rgb): string =>
  `#${rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [
  a[0] + (b[0] - a[0]) * amount,
  a[1] + (b[1] - a[1]) * amount,
  a[2] + (b[2] - a[2]) * amount,
];

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast between two "#rrggbb" colours: 1 (the same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The colour itself if it is readable enough against `against`, otherwise a darker shade of it. */
function darkenUntil(hex: string, against: string, target: number): string {
  const start = toRgb(hex);
  for (let step = 0; step <= 50; step += 1) {
    const shade = toHex(mix(start, [0, 0, 0], step * 0.02));
    if (contrast(shade, against) >= target) return shade;
  }
  return '#000000';
}

/** A pale version of the colour: mostly white, but never so pale that it vanishes on a white card. */
function washOf(hex: string): string {
  const rgb = toRgb(hex);
  for (let white = 90; white >= 50; white -= 4) {
    const wash = toHex(mix(rgb, [255, 255, 255], white / 100));
    if (contrast(wash, WHITE) >= WASH_VISIBLE) return wash;
  }
  return toHex(mix(rgb, [255, 255, 255], 0.5));
}

/**
 * The shades for a church's colour.
 *
 * No colour, an unreadable value, or the standard blue itself all give the standard
 * shades (the very same object, so callers can compare with `===`). A colour that
 * is too light to carry white text is darkened just enough; one that is already
 * dark enough is used exactly as picked.
 */
export function accentFrom(value: unknown): Accent {
  const hex = normalizeHex(value);
  if (!hex || hex === DEFAULT_COLOR) return DEFAULT_ACCENT;
  const azure = darkenUntil(hex, WHITE, ON_SOLID);
  // White and near-white have no wash of their own: use the darkened shade's.
  let azureTint = washOf(hex);
  if (contrast(azureTint, WHITE) < WASH_VISIBLE) azureTint = washOf(azure);
  return {
    azure,
    azureText: darkenUntil(azure, PAGE, TEXT_ON_PAGE),
    azureTint,
    azureTintText: darkenUntil(azure, azureTint, TEXT_ON_WASH),
  };
}

/** True when the app will show a darker shade than the one picked, so white text stays readable. */
export function isDarkened(value: unknown): boolean {
  const hex = normalizeHex(value);
  return hex !== null && accentFrom(hex).azure !== hex;
}
