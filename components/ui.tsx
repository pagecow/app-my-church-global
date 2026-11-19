import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, GUTTER, initialsOf, radius, TAP, text } from '../lib/theme';

/**
 * The parts every screen is built from. Keep this file identical in both phone
 * apps (app-my-church-global and amc-central-community-church).
 */

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ Avatar */

export function Avatar({
  uri,
  name,
  size = 40,
  style,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[shape, styles.avatarImage, style as any]} />;
  }
  return (
    <View style={[shape, styles.avatarFallback, style]}>
      <Text style={[styles.avatarText, { fontSize: Math.round(size * 0.38) }]}>{initialsOf(name)}</Text>
    </View>
  );
}

/** A church's or a group's picture: a rounded square, not a circle, so it never reads as a person. */
export function Tile({
  uri,
  name,
  size = 46,
  tinted = false,
  icon,
  fit = 'cover',
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  tinted?: boolean;
  icon?: IconName;
  /** `contain` shows the whole picture: for a church's logo, which is rarely square. */
  fit?: 'cover' | 'contain';
}) {
  const shape = { width: size, height: size, borderRadius: Math.round(size * 0.28) };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        resizeMode={fit}
        style={[shape, fit === 'contain' ? styles.logoImage : styles.avatarImage]}
      />
    );
  }
  return (
    <View style={[shape, styles.tileFallback, tinted && { backgroundColor: colors.azureTint }]}>
      {icon ? (
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={tinted ? colors.azureTintText : colors.inkSoft} />
      ) : (
        <Text
          style={[
            styles.tileText,
            { fontSize: Math.round(size * 0.36), color: tinted ? colors.azureTintText : colors.inkSoft },
          ]}
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

/* ----------------------------------------------------------------- Buttons */

type ButtonKind = 'primary' | 'tinted' | 'plain' | 'quiet' | 'danger';

/**
 * A full-width action. `primary` is the one main action of a screen (blue);
 * `tinted` is a second choice; `plain` is white, for use on the grey page;
 * `quiet` is grey, for use on a white card; `danger` is for deleting or leaving.
 */
export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'large',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  size?: 'large' | 'small';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
}) {
  const palette = BUTTON_COLORS[kind];
  const small = size === 'small';
  const iconSize = small ? 16 : 19;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      // A small button is drawn 34pt tall; the area that takes the tap is 44pt.
      hitSlop={small ? SMALL_BUTTON_HIT_SLOP : undefined}
      style={[
        small ? styles.buttonSmall : styles.button,
        { backgroundColor: palette.bg },
        disabled && !loading ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={iconSize} color={palette.fg} /> : null}
          <Text style={[small ? text.buttonSmall : text.button, { color: palette.fg }]} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={iconSize} color={palette.fg} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

const SEGMENT_HIT_SLOP = { top: 4, bottom: 4 };
const SMALL_BUTTON_HIT_SLOP = { top: 5, bottom: 5, left: 4, right: 4 };

const BUTTON_COLORS: Record<ButtonKind, { bg: string; fg: string }> = {
  primary: { bg: colors.azure, fg: colors.white },
  tinted: { bg: colors.azureTint, fg: colors.azureTintText },
  plain: { bg: colors.card, fg: colors.azureText },
  quiet: { bg: colors.fillSoft, fg: colors.ink },
  danger: { bg: colors.redTint, fg: colors.red },
};

/** A round icon button. The visible circle is smaller than the area that takes the tap. */
export function CircleButton({
  icon,
  onPress,
  kind = 'quiet',
  size = 34,
  accessibilityLabel,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  kind?: 'accent' | 'quiet' | 'floating' | 'dark';
  size?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette =
    kind === 'accent'
      ? { bg: colors.azure, fg: colors.white }
      : kind === 'floating'
      ? { bg: colors.card, fg: colors.ink }
      : kind === 'dark'
      ? { bg: 'rgba(0, 0, 0, 0.45)', fg: colors.white }
      : { bg: colors.fill, fg: colors.ink };
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.circleHit, style]}
    >
      <View
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg },
          styles.circle,
          kind === 'floating' ? styles.floating : null,
        ]}
      >
        <Ionicons name={icon} size={Math.round(size * 0.56)} color={palette.fg} />
      </View>
    </TouchableOpacity>
  );
}

/** A small rounded label: "Going", "Requested", "Weekly". Not a button. */
export function Chip({
  label,
  kind = 'neutral',
  icon,
}: {
  label: string;
  kind?: 'neutral' | 'accent' | 'success' | 'danger';
  icon?: IconName;
}) {
  const palette =
    kind === 'accent'
      ? { bg: colors.azureTint, fg: colors.azureTintText }
      : kind === 'success'
      ? { bg: colors.greenTint, fg: colors.green }
      : kind === 'danger'
      ? { bg: colors.redTint, fg: colors.red }
      : { bg: colors.fillSoft, fg: colors.inkSoft };
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      {icon ? <Ionicons name={icon} size={13} color={palette.fg} /> : null}
      <Text style={[styles.chipText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ----------------------------------------------------------------- Headers */

/**
 * The top of a screen that was opened from another one: a back button, the
 * title in the middle, and room for one action on the right.
 */
export function StackHeader({
  title,
  onBack,
  backIcon = 'chevron-back',
  backLabel,
  right,
  background = colors.page,
}: {
  title?: string;
  onBack?: () => void;
  backIcon?: IconName;
  /** What the back button is read out as, when "Back" would mislead. */
  backLabel?: string;
  right?: React.ReactNode;
  background?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.stackHeader, { paddingTop: insets.top + 4, backgroundColor: background }]}>
      <View style={styles.stackSide}>
        {onBack ? (
          <CircleButton
            icon={backIcon}
            onPress={onBack}
            kind={background === colors.card ? 'quiet' : 'floating'}
            accessibilityLabel={backLabel || (backIcon === 'close' ? 'Close' : 'Back')}
          />
        ) : null}
      </View>
      <Text style={styles.stackTitle} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.stackSide, styles.stackSideRight]}>{right}</View>
    </View>
  );
}

/** A text action for the right side of a header or a sheet: "Save", "Add", "Done". */
export function HeaderAction({
  label,
  onPress,
  disabled = false,
  loading = false,
  bold = true,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  bold?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.headerAction}
    >
      {loading ? (
        <ActivityIndicator color={colors.azure} />
      ) : (
        <Text
          style={[
            styles.headerActionText,
            bold ? { fontWeight: '600' } : null,
            disabled ? { color: colors.inkFaint } : null,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * The top of a sheet (a modal that slides up): "Cancel" on the left, the title,
 * and the main action on the right.
 */
export function SheetHeader({
  title,
  cancelLabel = 'Cancel',
  onCancel,
  actionLabel,
  onAction,
  actionDisabled,
  actionLoading,
  /** A page sheet on iPhone starts below the status bar, so it needs no inset of its own. */
  fullScreen = true,
}: {
  title: string;
  cancelLabel?: string;
  onCancel: () => void;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  fullScreen?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheetHeader, { paddingTop: (fullScreen ? insets.top : 0) + 8 }]}>
      <View style={styles.sheetSide}>
        <HeaderAction label={cancelLabel} onPress={onCancel} bold={false} />
      </View>
      <Text style={styles.stackTitle} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.sheetSide, styles.stackSideRight]}>
        {actionLabel ? (
          <HeaderAction label={actionLabel} onPress={onAction} disabled={actionDisabled} loading={actionLoading} />
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Small pieces */

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[text.section, styles.sectionTitle, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Small capital label above a group of rows. */
export function GroupLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[text.label, styles.groupLabel, style]}>{String(children).toUpperCase()}</Text>;
}

/** Two or three choices side by side, one of them selected. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            hitSlop={SEGMENT_HIT_SLOP}
            style={[styles.segment, on ? styles.segmentOn : null]}
          >
            <Text style={[styles.segmentText, on ? styles.segmentTextOn : null]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** What a list shows when it has nothing in it. */
export function EmptyState({
  icon,
  title,
  hint,
  children,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={styles.emptyIcon}>
          <Ionicons name={icon} size={28} color={colors.inkMuted} />
        </View>
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

/** A full-screen spinner while a screen loads. */
export function Loading({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.loading, style]}>
      <ActivityIndicator size="large" color={colors.azure} />
    </View>
  );
}

/** A red or grey message inside a screen: a failed load, a notice. */
export function Notice({
  message,
  kind = 'danger',
  actionLabel,
  onAction,
  style,
}: {
  message: string;
  kind?: 'danger' | 'neutral';
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const danger = kind === 'danger';
  return (
    <View style={[styles.notice, { backgroundColor: danger ? colors.redTint : colors.fill }, style]}>
      <Text style={[styles.noticeText, { color: danger ? colors.red : colors.inkSoft }]}>{message}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" style={styles.noticeAction}>
          <Text style={[styles.noticeActionText, { color: danger ? colors.red : colors.azureText }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Goes under the box where someone types a code that was emailed to them.
 *
 * Most "I never got my code" calls are a misspelled address, so the address is
 * shown again in large type, with a button, in words, that takes them back to
 * fix it.
 */
export function CodeHelp({
  email,
  onFixEmail,
  style,
}: {
  email: string;
  onFixEmail: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.codeHelp, style]}>
      <Text style={styles.codeHelpTitle} accessibilityRole="header">
        Didn’t get your code?
      </Text>
      <Text style={styles.codeHelpText}>Check that your email is spelled correctly:</Text>
      <Text style={styles.codeHelpEmail} selectable>
        {email.trim()}
      </Text>
      <Button label="Fix My Email" kind="tinted" onPress={onFixEmail} style={styles.codeHelpButton} />
      <Text style={styles.codeHelpText}>Also look in your spam or junk folder.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarImage: { backgroundColor: colors.fill },
  logoImage: { backgroundColor: colors.card },
  avatarFallback: { backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.inkSoft, fontWeight: '600' },
  tileFallback: { backgroundColor: colors.fillSoft, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontWeight: '700' },

  button: {
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonSmall: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonDisabled: { opacity: 0.45 },

  circleHit: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center' },
  floating: {
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  chip: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipText: { fontSize: 12, fontWeight: '600' },

  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  stackSide: { minWidth: TAP, minHeight: TAP, flexDirection: 'row', alignItems: 'center' },
  stackSideRight: { justifyContent: 'flex-end' },
  stackTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.ink,
    paddingHorizontal: 4,
  },
  headerAction: { minHeight: TAP, minWidth: TAP, paddingHorizontal: 8, justifyContent: 'center' },
  headerActionText: { fontSize: 17, color: colors.azureText },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: colors.page,
  },
  sheetSide: { minWidth: 84, minHeight: TAP, flexDirection: 'row', alignItems: 'center' },

  sectionTitle: { marginTop: 18, marginBottom: 8 },
  groupLabel: { marginLeft: GUTTER, marginBottom: 8 },

  segmented: { flexDirection: 'row', padding: 2, borderRadius: radius.sm, backgroundColor: colors.fill },
  segment: { flex: 1, height: 36, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center' },
  segmentOn: {
    backgroundColor: colors.card,
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.inkSoft },
  segmentTextOn: { fontWeight: '600', color: colors.ink },

  empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 6 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { ...text.headline, textAlign: 'center' },
  emptyHint: { ...text.secondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page },

  notice: {
    marginHorizontal: GUTTER,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 19 },
  noticeAction: { minHeight: 32, justifyContent: 'center' },
  noticeActionText: { fontSize: 14, fontWeight: '600' },

  codeHelp: {
    marginTop: 24,
    padding: 20,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  codeHelpTitle: { ...text.headline, textAlign: 'center', marginBottom: 6 },
  codeHelpText: { ...text.body, color: colors.inkSoft, textAlign: 'center' },
  // Large and dark on purpose: this is where a wrong letter gets noticed.
  codeHelpEmail: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    marginTop: 6,
  },
  codeHelpButton: { alignSelf: 'stretch', marginTop: 14, marginBottom: 14 },
});
