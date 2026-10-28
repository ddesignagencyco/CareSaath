import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  StyleSheet,
  View,
  type PressableProps,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { accent, brand, colors, feedback, fonts, ink, radius, shadow, space, TOUCH, themed, brandFixed } from '../theme';
import { useSettings } from '../i18n';
import { initials } from '../i18n/format';
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Clock, Hourglass, Info, type IconType } from './icons';
import { Text } from './Text';

/* ---- Pressable base ------------------------------------------------------ */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** True inside teal brand headers: icon buttons default to white there. */
export const OnDark = React.createContext(false);

/**
 * Press feedback: the element sinks slightly (scale, native driver) plus the
 * platform's own cue — a ripple on Android, a dim on iOS. Android only draws
 * the ripple inside rounded corners when the view clips, so it clips there.
 * `pressScale={false}` for large surfaces where shrinking would look odd.
 */
export function Touchable({
  style,
  rippleColor = colors.ripple,
  pressScale = true,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; rippleColor?: string; pressScale?: boolean }) {
  const p = useRef(new Animated.Value(0)).current;
  const { reduceMotion } = useSettings();
  const shrink = pressScale && !reduceMotion;
  const to = (v: number) => Animated.spring(p, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v ? 0 : 6 }).start();
  const anim = {
    transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, shrink ? 0.97 : 1] }) }],
    ...(Platform.OS === 'ios' ? { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) } : null),
  };
  return (
    <AnimatedPressable
      android_ripple={{ color: rippleColor, foreground: true }}
      onPressIn={e => {
        to(1);
        onPressIn?.(e);
      }}
      onPressOut={e => {
        to(0);
        onPressOut?.(e);
      }}
      style={[style, Platform.OS === 'android' && styles.clip, anim]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}

/* ---- Button -------------------------------------------------------------- */

/**
 * primary: the main action. success: positive confirmations (accept, confirm
 * cash, mark done). danger: destructive/emergency. dangerOutline: destructive
 * but secondary (sign out, decline, cancel booking). live: marigold highlight.
 */
/** Shared by Button and any custom button-like control, so heights match everywhere. */
export const BUTTON_HEIGHT = 46;

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline' | 'success' | 'live';

const VARIANT: Record<Variant, { bg: string; fg: string; border?: string; ripple: string }> = themed(() => ({
  primary: { bg: colors.primary, fg: colors.onPrimary, ripple: 'rgba(255,255,255,0.2)' },
  secondary: { bg: colors.surface, fg: ink[800], border: ink[200], ripple: colors.ripple },
  ghost: { bg: 'transparent', fg: colors.primaryText, ripple: colors.ripple },
  danger: { bg: feedback.danger600, fg: '#fff', ripple: 'rgba(255,255,255,0.2)' },
  dangerOutline: { bg: feedback.danger50, fg: feedback.danger700, border: feedback.danger200, ripple: 'rgba(220,38,38,0.12)' },
  success: { bg: feedback.success600, fg: '#fff', ripple: 'rgba(255,255,255,0.2)' },
  live: { bg: accent[400], fg: brand[950], ripple: 'rgba(0,0,0,0.1)' },
}));

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  size?: 'md' | 'lg';
  icon?: IconType;
  loading?: boolean;
  block?: boolean;
  /** Mirror the icon in Urdu (sign-out, send, arrows). */
  mirrorIcon?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, variant = 'primary', size = 'md', icon: Icon, loading, block, mirrorIcon, disabled, style, ...rest }: ButtonProps) {
  const v = VARIANT[variant];
  const { largeText } = useSettings();
  // One height for every button in the app (width follows the layout); `size` is kept for API compatibility.
  void size;
  const height = BUTTON_HEIGHT + (largeText ? 8 : 0);
  // On teal surfaces a faded fill turns muddy; use a clean translucent disabled state.
  const dark = React.useContext(OnDark);
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      rippleColor={v.ripple}
      style={[
        styles.button,
        { height, backgroundColor: v.bg, borderColor: v.border ?? v.bg, borderWidth: v.border ? 1 : 0 },
        block && styles.block,
        (disabled || loading) && (dark ? styles.disabledDark : styles.disabled),
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : Icon ? (
        mirrorIcon ? <DirIcon icon={Icon} size={18} color={v.fg} strokeWidth={2.2} /> : <Icon size={18} color={v.fg} strokeWidth={2.2} />
      ) : null}
      <Text variant="body" weight="bold" color={v.fg} numberOfLines={1} align="center">
        {label}
      </Text>
    </Touchable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  color,
  bg,
  size = 22,
  badge,
}: {
  icon: IconType;
  label: string;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  badge?: number;
}) {
  const dark = React.useContext(OnDark);
  const fg = color ?? (dark ? '#fff' : ink[700]);
  const fill = bg ?? (dark ? 'rgba(255,255,255,0.12)' : 'transparent');
  // The count badge sits outside the press area, which clips to its circle.
  return (
    <View>
      <Touchable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} rippleColor={dark ? 'rgba(255,255,255,0.2)' : undefined} style={[styles.iconButton, { backgroundColor: fill }]}>
        <Icon size={size} color={fg} strokeWidth={2} />
      </Touchable>
      {!!badge && (
        <View style={styles.iconBadge} pointerEvents="none">
          <CountBadge count={badge} />
        </View>
      )}
    </View>
  );
}

/**
 * Unread / count bubble. Uses the Latin bold face with fixed metrics in every
 * language (Urdu's taller line box and Android font padding knock digits
 * off-centre), so the number always sits dead centre.
 */
export function CountBadge({ count, light }: { count: number; light?: boolean }) {
  const label = count > 99 ? '99+' : String(count);
  return (
    <View style={[styles.count, label.length > 1 && styles.countWide, light && styles.countLight]} accessibilityLabel={label}>
      <RNText style={[styles.countText, light && styles.countTextLight]} allowFontScaling={false}>
        {label}
      </RNText>
    </View>
  );
}

/** Chevron that points "forward" / "back" in the reading direction. */
export function DirChevron({ back, color = ink[400], size = 20 }: { back?: boolean; color?: string; size?: number }) {
  const { isRTL } = useSettings();
  const Icon = !!back !== isRTL ? ChevronLeft : ChevronRight;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
}

/* ---- Surfaces ------------------------------------------------------------ */

export function Card({ children, style, onPress, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  // Android: clip so pressed rows inside keep the card's rounded corners (elevation survives clipping there).
  const body = [styles.card, padded && styles.cardPad, Platform.OS === 'android' && styles.clip, style];
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" style={[body, styles.clip]}>
      {children}
    </Touchable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginStart: inset }]} />;
}

/* ---- Badge --------------------------------------------------------------- */

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const TONE: Record<Tone, { bg: string; fg: string; border: string; icon?: IconType }> = themed(() => ({
  neutral: { bg: ink[50], fg: ink[600], border: ink[200], icon: CircleX },
  brand: { bg: brand[50], fg: brand[700], border: brand[200], icon: CircleCheck },
  success: { bg: feedback.success50, fg: feedback.success700, border: feedback.success200, icon: CircleCheck },
  warning: { bg: feedback.warning50, fg: feedback.warning700, border: feedback.warning200, icon: Hourglass },
  danger: { bg: feedback.danger50, fg: feedback.danger700, border: feedback.danger200, icon: CircleAlert },
  info: { bg: feedback.info50, fg: feedback.info700, border: feedback.info200, icon: Info },
  accent: { bg: accent[50], fg: accent[700], border: accent[200], icon: Clock },
}));

/**
 * Status label. The leading icon says what kind of state it is (done,
 * waiting, problem) so status reads without relying on colour alone.
 * `icon={null}` for a plain label; pass an icon to override.
 */
export function Badge({ tone = 'neutral', label, icon, style }: { tone?: Tone; label: string; icon?: IconType | null; style?: StyleProp<ViewStyle> }) {
  const t = TONE[tone];
  const Icon = icon === undefined ? t.icon : icon;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      {Icon && <Icon size={13} color={t.fg} strokeWidth={2.6} />}
      {/* Long Urdu statuses wrap to a second line instead of shrinking or truncating. */}
      <Text variant="caption" weight="bold" color={t.fg} numberOfLines={2} style={styles.badgeText}>
        {label}
      </Text>
    </View>
  );
}

/* ---- Chips & segmented --------------------------------------------------- */

export function Chip({ label, selected, onPress, icon: Icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconType }) {
  return (
    <Touchable
      // Remount on toggle: Android drops rounded corners when backgroundColor changes in place.
      key={selected ? 'on' : 'off'}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}>
      {Icon && <Icon size={16} color={selected ? '#fff' : ink[600]} strokeWidth={2.2} />}
      <Text variant="small" weight="semibold" color={selected ? '#fff' : ink[700]} numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            // Value + state in the key: remount on toggle so the rounded highlight is drawn fresh.
            key={`${o.value}-${on ? 'on' : 'off'}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && styles.segmentOn]}>
            <Text variant="small" weight={on ? 'bold' : 'semibold'} color={on ? brand[800] : ink[500]} align="center" numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---- List row ------------------------------------------------------------ */

export function ListRow({
  icon: Icon,
  title,
  subtitle,
  onPress,
  right,
  danger,
  chevron = !!onPress,
  mirrorIcon,
  tone,
}: {
  /** Coloured icon tile (menu rows); without it the icon sits on the default teal tint. */
  tone?: TileTone;
  /** Mirror the leading icon in Urdu (sign-out, send, arrows). */
  mirrorIcon?: boolean;
  icon?: IconType;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) {
  const content = (
    <>
      {Icon && tone ? (
        <IconTile icon={Icon} tone={danger ? 'danger' : tone} size={40} />
      ) : Icon && (
        <View style={[styles.rowIcon, danger && { backgroundColor: feedback.danger50 }]}>
          {mirrorIcon ? <DirIcon icon={Icon} color={danger ? feedback.danger600 : brand[700]} /> : <Icon size={20} color={danger ? feedback.danger600 : brand[700]} strokeWidth={2} />}
        </View>
      )}
      <View style={styles.flex}>
        <Text weight="semibold" color={danger ? feedback.danger700 : colors.text}>
          {title}
        </Text>
        {!!subtitle && (
          <Text variant="small" color={colors.textMuted}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {chevron && <DirChevron />}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={styles.row}>
      {content}
    </Touchable>
  );
}

/* ---- Avatar -------------------------------------------------------------- */

const SVG_DATA = 'data:image/svg+xml';

/** The mock serves photos as SVG data URLs, which <Image> can't draw. */
function svgFromDataUrl(url: string): string | null {
  if (!url.startsWith(SVG_DATA)) return null;
  try {
    return decodeURIComponent(url.slice(url.indexOf(',') + 1));
  } catch {
    return null;
  }
}

export function Avatar({ name, uri, size = 48 }: { name: string; uri?: string | null; size?: number }) {
  const svg = uri ? svgFromDataUrl(uri) : null;
  if (svg)
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <SvgXml xml={svg} width={size} height={size} />
      </View>
    );
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: brand[100] }} accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text weight="bold" color={brand[700]} align="center" numeric style={{ fontSize: size * 0.36, lineHeight: size * 0.5 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/* ---- Icon tile ------------------------------------------------------------ */

export type TileTone = 'teal' | 'marigold' | 'mint' | 'sand' | 'ink' | 'danger';

/** Tinted squircle behind an icon. Tones stay inside the brand palette. */
export const TILE: Record<TileTone, { bg: string; fg: string }> = themed(() => ({
  teal: { bg: brand[50], fg: brand[700] },
  marigold: { bg: accent[50], fg: accent[600] },
  mint: { bg: brand[100], fg: brand[800] },
  sand: { bg: accent[100], fg: accent[700] },
  ink: { bg: ink[50], fg: ink[700] },
  danger: { bg: feedback.danger50, fg: feedback.danger600 },
}));

export function IconTile({ icon: Icon, tone = 'teal', size = 44 }: { icon: IconType; tone?: TileTone; size?: number }) {
  const t = TILE[tone];
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: t.bg }]}>
      <Icon size={Math.round(size * 0.5)} color={t.fg} strokeWidth={2} />
    </View>
  );
}

/* ---- Date block ----------------------------------------------------------- */

/**
 * Calendar-leaf date for schedule rows: big day number over a short label
 * ("Today", "Thu"). Digits stay Latin in both languages.
 */
export function DateBlock({ day, label, highlight }: { day: number; label: string; highlight?: boolean }) {
  return (
    <View style={[styles.dateBlock, highlight && styles.dateBlockOn]}>
      <Text variant="h2" weight="extrabold" color={highlight ? '#fff' : brand[800]} align="center" numeric tabular>
        {String(day)}
      </Text>
      <Text variant="caption" weight="semibold" color={highlight ? brandFixed[100] : ink[500]} align="center" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ---- Direction-aware icon --------------------------------------------------- */

/** Icons that point along the reading direction (sign-out, send, arrows) mirror in Urdu. */
export function DirIcon({ icon: Icon, size = 20, color = ink[700], strokeWidth = 2 }: { icon: IconType; size?: number; color?: string; strokeWidth?: number }) {
  const { isRTL } = useSettings();
  return (
    <View style={isRTL ? styles.mirror : undefined}>
      <Icon size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  );
}

/* ---- Horizontal scroller ---------------------------------------------------- */

/**
 * Horizontal ScrollView that opens at the reading start. Under a root
 * `direction: 'rtl'` the content is laid out right-to-left but scroll offset
 * 0 is still the left edge, so in Urdu it jumps to the far end once measured.
 */
export function HScroll({ children, contentContainerStyle, style }: { children: React.ReactNode; contentContainerStyle?: StyleProp<ViewStyle>; style?: StyleProp<ViewStyle> }) {
  const { isRTL } = useSettings();
  const ref = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={contentContainerStyle}
      onContentSizeChange={() => {
        if (isRTL) ref.current?.scrollToEnd({ animated: false });
      }}>
      {children}
    </ScrollView>
  );
}

/* ---- Layout helpers ------------------------------------------------------ */

export const Row = ({ children, gap = space.sm, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.hrow, { gap }, style]}>{children}</View>
);

export const Gap = ({ h = space.lg }: { h?: number }) => <View style={{ height: h }} />;

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  disabledDark: { opacity: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'transparent' },
  iconButton: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconBadge: { position: 'absolute', top: 4, end: 2 },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: feedback.danger600,
    borderWidth: 2,
    borderColor: colors.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countWide: { paddingHorizontal: 4 },
  countLight: { backgroundColor: feedback.danger50, borderColor: feedback.danger200 },
  countText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 13,
    color: '#fff',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
    writingDirection: 'ltr',
  },
  countTextLight: { color: feedback.danger700 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardPad: { padding: space.lg },
  clip: { overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: ink[200] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 11, borderWidth: 1, maxWidth: '100%', flexShrink: 1 },
  badgeText: { flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipOn: { backgroundColor: brand[700], borderColor: brand[700] },
  chipOff: { backgroundColor: colors.surface, borderColor: ink[200] },
  segmented: { flexDirection: 'row', backgroundColor: ink[100], borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  segmentOn: { backgroundColor: colors.surface, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.md, paddingHorizontal: space.lg },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
  avatar: { backgroundColor: brand[100], alignItems: 'center', justifyContent: 'center' },
  hrow: { flexDirection: 'row', alignItems: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  dateBlock: { width: 60, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: brand[50], alignItems: 'center' },
  dateBlockOn: { backgroundColor: brand[700] },
  mirror: { transform: [{ scaleX: -1 }] },
}));
