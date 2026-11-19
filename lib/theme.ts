import { Platform, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import type { Accent } from './accent';

/**
 * The one place the app's look is decided.
 *
 * The colours are the website's palette (ink / mist / hairline in
 * app-my-church/tailwind.config.js) so the app, the dashboard and the site read
 * as one product. Screens take colours, text sizes and shapes from here: a
 * colour written directly in a screen is a mistake.
 *
 * The one accent colour is NOT here. It is the church's own colour (or the
 * standard blue when the church has not picked one), so it can change while the
 * app runs. A screen gets it from lib/churchColor.ts: `useAccent()` for the four
 * shades (azure, azureText, azureTint, azureTintText), `themedStyles(...)` for a
 * StyleSheet that needs them. lib/accent.ts works the shades out.
 *
 * Keep this file identical in both phone apps (app-my-church-global and
 * amc-central-community-church).
 */
export const colors = {
  /** Text. `inkMuted` is the lightest text allowed on white or on `page`. */
  ink: '#1d1d1f',
  inkSoft: '#424245',
  inkMuted: '#6e6e73',
  /** Placeholders and decorative icons only: too light for text people must read. */
  inkFaint: '#86868b',

  /** Surfaces. */
  page: '#f5f5f7',
  card: '#ffffff',
  /** Avatar fallbacks, the segmented control's track, search fields. */
  fill: '#e3e3e8',
  /** Chips and fields that sit on a white card. */
  fillSoft: '#f0f0f3',
  hairline: '#e8e8ed',
  /** A thin line: between rows, under a sheet's title, above a text box. */
  line: '#d2d2d7',
  /** The small handle at the top of a sheet that slides up. */
  grabber: '#c7c7cc',

  /** Meaning, never decoration. */
  red: '#d70015',
  redTint: '#fdecee',
  green: '#1a6b31',
  greenTint: '#e4f3e8',

  /**
   * A reaction keeps its own colour once tapped, so it is recognised at a glance.
   * A like takes the church's colour (`accent.azure`), so it is not listed here.
   */
  love: '#e0364f',
  pray: '#f0a020',

  white: '#ffffff',
  black: '#000000',
  scrim: 'rgba(0, 0, 0, 0.4)',
} as const;

export const radius = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** A white block of rows. A list that rounds only its first and last row uses this too. */
  group: 18,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** Side margin of every screen, and the gap between cards. */
export const GUTTER = 16;
export const CARD_GAP = 12;

/** The smallest thing a finger should have to hit. */
export const TAP = 44;

/**
 * Text styles. The system font is used on purpose: San Francisco on iPhone and
 * Roboto on Android, which is what makes the app feel native on each.
 */
export const text = StyleSheet.create({
  /** A tab's own title: "Events", "Groups". */
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6, color: colors.ink },
  /** A screen's main heading below a photo, or the church name on Home. */
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4, color: colors.ink },
  /** A section inside a screen: "This week", "My groups". */
  section: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3, color: colors.ink },
  /** A row's or a card's title. */
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink },
  bodyLarge: { fontSize: 17, lineHeight: 24, color: colors.ink },
  /** The second line of a row. */
  secondary: { fontSize: 14, lineHeight: 19, color: colors.inkMuted },
  footnote: { fontSize: 13, lineHeight: 18, color: colors.inkMuted },
  /** Small capital label above a group of rows: "REPEATS". */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.3, color: colors.inkMuted },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  buttonSmall: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
}) as Record<
  | 'largeTitle'
  | 'title'
  | 'section'
  | 'headline'
  | 'body'
  | 'bodyLarge'
  | 'secondary'
  | 'footnote'
  | 'label'
  | 'button'
  | 'buttonSmall',
  TextStyle
>;

/** Words that can be tapped: "Forgot Password?", "Change photo". In the church's colour. */
export const linkText = (accent: Accent): TextStyle => ({
  fontSize: 16,
  lineHeight: 22,
  fontWeight: '500',
  color: accent.azureText,
});

/** Shapes several screens share. */
export const shapes = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  /** A white rounded block on the grey page. */
  card: { backgroundColor: colors.card, borderRadius: radius.xl, overflow: 'hidden' },
  /** A white rounded block of rows (a grouped list). */
  group: { backgroundColor: colors.card, borderRadius: radius.group, overflow: 'hidden' },
  /** The line between two rows of a group. Give it a left margin to clear the row's icon. */
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  /** A text field on the grey page. */
  input: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 15 : 12,
    fontSize: 17,
    color: colors.ink,
  },
  /** A text field on a white card or sheet. */
  inputOnCard: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.fillSoft,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 11,
    fontSize: 17,
    color: colors.ink,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}) as Record<'page' | 'card' | 'group' | 'divider' | 'input' | 'inputOnCard' | 'center', ViewStyle & TextStyle>;

/** First letters of up to two names: "Sarah Mitchell" becomes "SM". */
export function initialsOf(name?: string | null): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}
