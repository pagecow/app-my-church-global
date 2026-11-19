/**
 * The colour the app is painted in: the church's own, or the standard blue.
 *
 * A church may pick one colour in the dashboard ("Logo and colors"). It arrives
 * as the optional field `theme_color` of the church (`GET /user`, `GET /app/:id`
 * and each row of the church search). Older servers do not send it, and a church
 * that has not picked one sends null: both mean the standard blue.
 *
 * lib/accent.ts turns that one colour into the four shades the screens use.
 * This file only holds the shades that are in use right now and tells the
 * screens when they change:
 *
 *   setChurchColor(church.theme_color)   whenever the app learns about a church
 *   showStandardColor()                  on a screen that is App My Church's own
 *                                        ("Find your church"), not a church's
 *   loadChurchColor()                    once at start, so the first screen is
 *                                        already in the colour seen last time
 *   useAccent()                          inside a component: the four shades
 *   themedStyles((accent) => StyleSheet.create({...}))
 *                                        a StyleSheet that needs the shades
 *
 * It is one small store for the whole app, so nothing has to be wrapped around
 * the screens. Keep this file identical in both phone apps (app-my-church-global
 * and amc-central-community-church).
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accent, DEFAULT_ACCENT, accentFrom, normalizeHex } from './accent';

/** Where the last church's colour is kept between launches. */
const STORAGE_KEY = 'churchThemeColor';

let current: Accent = DEFAULT_ACCENT;
const listeners = new Set<() => void>();

/** What is known to be in storage: a colour, null for none, undefined before the first read or write. */
let remembered: string | null | undefined;
/** True once the app has been told a colour, so a slow first read cannot undo it. */
let told = false;

const sameShades = (a: Accent, b: Accent) =>
  a.azure === b.azure &&
  a.azureText === b.azureText &&
  a.azureTint === b.azureTint &&
  a.azureTintText === b.azureTintText;

function apply(hex: string | null) {
  const next = accentFrom(hex);
  // Screens are only told when a shade really changed: the church is re-read
  // every time the app comes to the front, nearly always with the same colour.
  if (sameShades(next, current)) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function remember(hex: string | null) {
  if (remembered === hex) return;
  remembered = hex;
  const write = hex ? AsyncStorage.setItem(STORAGE_KEY, hex) : AsyncStorage.removeItem(STORAGE_KEY);
  // A phone that cannot store it simply starts in the standard blue next time.
  write.catch(() => {});
}

/**
 * Paints the app in a church's colour. Pass `church.theme_color` as it came:
 * null, a missing field or anything that is not a hex colour give the standard blue.
 */
export function setChurchColor(value: unknown): void {
  const hex = normalizeHex(value);
  told = true;
  apply(hex);
  remember(hex);
}

/**
 * Paints the standard blue without forgetting the church's colour. For a screen
 * that belongs to no church ("Find your church"). The church picked last keeps
 * its colour in storage, so its login screen is in that colour when the app is
 * opened again.
 */
export function showStandardColor(): void {
  told = true;
  apply(null);
}

/** Reads the colour seen last time. Called once, before the first screen is shown. */
export async function loadChurchColor(): Promise<void> {
  try {
    const stored = normalizeHex(await AsyncStorage.getItem(STORAGE_KEY));
    if (told) return;
    remembered = stored;
    apply(stored);
  } catch {
    // Nothing remembered: the standard blue.
  }
}

/** The shades in use right now, for code that is not a component. */
export function getAccent(): Accent {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The four shades, inside a component. The component is drawn again when the church's colour changes. */
export function useAccent(): Accent {
  return useSyncExternalStore(subscribe, getAccent, getAccent);
}

/**
 * For a StyleSheet that uses the church's colour:
 *
 *   const useStyles = themedStyles((accent) => StyleSheet.create({ ... }));
 *   function Screen() { const styles = useStyles(); ... }
 *
 * The styles are built once per colour, not once per render. Call `useStyles()`
 * at the very top of the component, before any early `return`.
 */
export function themedStyles<T>(factory: (accent: Accent) => T): () => T {
  let builtFor: Accent | null = null;
  let built: T | undefined;
  return function useThemedStyles(): T {
    const accent = useAccent();
    if (builtFor !== accent) {
      built = factory(accent);
      builtFor = accent;
    }
    return built as T;
  };
}
