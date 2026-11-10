import { Platform } from 'react-native';

/**
 * What the OS was willing to tell us about the person's age.
 *
 * `unknown` is the common case and is not an error: the API only answers on
 * iOS 26.0 and later, only inside a region with an age-assurance law, and only
 * if the person accepts the system prompt. Anything else falls back to the
 * birth date they type.
 */
export type DeclaredAge = 'adult' | 'under-13' | 'unknown';

const MINIMUM_AGE = 13;

/**
 * Asks iOS for the person's declared age range.
 *
 * This is Apple's Declared Age Range framework, reached through
 * `expo-age-range`. It never throws: a missing native module, an older OS, a
 * declined prompt or a network failure all resolve to `unknown`, and the caller
 * continues to the birth-date check.
 */
export async function checkDeclaredAge(): Promise<DeclaredAge> {
  if (Platform.OS !== 'ios') return 'unknown';

  try {
    const AgeRange = await import('expo-age-range');

    const result = await AgeRange.requestAgeRangeAsync({
      threshold1: MINIMUM_AGE,
      threshold2: 18,
    });

    // A 13+ lower bound is the OS saying outright that they clear the gate.
    if (typeof result?.lowerBound === 'number' && result.lowerBound >= MINIMUM_AGE) {
      return 'adult';
    }

    // An upper bound under 13 is equally explicit, in the other direction.
    if (typeof result?.upperBound === 'number' && result.upperBound < MINIMUM_AGE) {
      return 'under-13';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}
