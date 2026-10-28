import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, ink, radius, space, themed, brandFixed } from '../theme';
import { useT } from '../i18n';
import { ApiError } from '../api/http';
import { CircleAlert, WifiOff, type IconType } from './icons';
import { CareIllustration, HeroBand } from './brand';
import { BrandLoader } from './Logo';
import { Text } from './Text';
import { Button, DirChevron, OnDark, Touchable } from './ui';

/* ---- Header -------------------------------------------------------------- */

/**
 * Teal brand header on every screen, matching Home: rounded bottom edge, the
 * faint heart texture, white text and light status-bar icons. `large` is the
 * tab-root variant (big title, no back); otherwise a compact bar with back.
 * Icon buttons placed in `right` turn white automatically (OnDark context).
 */
export function Header({ title, back, right, subtitle, large }: { title?: string; back?: boolean | (() => void); right?: React.ReactNode; subtitle?: string; large?: boolean }) {
  const nav = useNavigation();
  const tc = useT('common.actions');
  const onBack = typeof back === 'function' ? back : () => nav.goBack();
  return (
    <OnDark.Provider value>
      <HeroBand style={large ? styles.bandLarge : styles.bandCompact}>
        <View style={styles.headerRow}>
          {back ? (
            <Touchable onPress={onBack} accessibilityRole="button" accessibilityLabel={tc('back')} hitSlop={4} rippleColor="rgba(255,255,255,0.2)" style={styles.back}>
              <DirChevron back color="#fff" size={24} />
            </Touchable>
          ) : null}
          <View style={styles.flex}>
            {!!title && (
              <Text variant={large ? 'h1' : 'title'} weight={large ? 'extrabold' : 'bold'} color="#fff" numberOfLines={1} accessibilityRole="header" style={large ? styles.largeTitle : undefined}>
                {title}
              </Text>
            )}
            {!!subtitle && !large && (
              <Text variant="small" color={brandFixed[100]} numberOfLines={2}>
                {subtitle}
              </Text>
            )}
          </View>
          {right}
        </View>
      </HeroBand>
      {/* Tab-root subtitles sit below the band, on the page background. */}
      {!!subtitle && large && (
        <Text color={colors.textMuted} style={styles.largeSubtitle}>
          {subtitle}
        </Text>
      )}
    </OnDark.Provider>
  );
}

/* ---- Screen -------------------------------------------------------------- */

/** True while the on-screen keyboard is up. */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * Standard screen: header, scrolling body, optional sticky footer for the
 * primary action (bottom = thumb zone). Pass `scroll={false}` when the body
 * is a FlatList that scrolls itself.
 */
export function Screen({
  title,
  subtitle,
  back,
  headerRight,
  header,
  children,
  footer,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  noHeader,
  largeTitle,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean | (() => void);
  headerRight?: React.ReactNode;
  /** Replaces the standard header entirely. */
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  noHeader?: boolean;
  /** Tab-root screens: big title instead of the compact bar. */
  largeTitle?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // The keyboard already covers the gesture/nav bar; keeping its inset too
  // left a big empty band between the footer (e.g. the chat box) and the keys.
  const keyboard = useKeyboardShown();
  return (
    // Android runs edge-to-edge (RN 0.88), so the window no longer resizes for
    // the keyboard: pad on both platforms to keep the sticky footer visible.
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      {header ?? (noHeader ? <View style={{ height: insets.top }} /> : <Header title={title} subtitle={subtitle} back={back} right={headerRight} large={largeTitle} />)}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, !footer && { paddingBottom: space.xxxl + insets.bottom }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[brand[600]]} tintColor={brand[600]} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {!!footer && <View style={[styles.footer, { paddingBottom: (keyboard ? 0 : insets.bottom) + space.md }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

export function Section({ title, action, children, style }: { title?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      {(!!title || !!action) && (
        <View style={styles.sectionHead}>
          <Text variant="lead" weight="bold" style={styles.flex} accessibilityRole="header">
            {title}
          </Text>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

/* ---- States -------------------------------------------------------------- */

export function LoadingState() {
  return (
    <View style={styles.state}>
      <BrandLoader fullScreen={false} />
    </View>
  );
}

/** Skeleton block for list placeholders; static (no shimmer) to save battery. */
export function Skeleton({ height = 88, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.skeleton, { height }, style]} />;
}

export function SkeletonList({ count = 3, height }: { count?: number; height?: number }) {
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </View>
  );
}

/** Error with a clear next step. Network failures get their own wording. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const tc = useT('common.states');
  const tm = useT('mobile.common');
  const te = useT('apiErrors');
  const offline = error instanceof ApiError && error.status === 0;
  const msg = error instanceof Error ? error.message : '';
  const key = msg.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (
    <EmptyState
      icon={offline ? WifiOff : CircleAlert}
      title={tc('couldntLoad')}
      text={offline ? te('Cannot_reach_the_server_Check_your_connection') : key && te.has(key) ? te(key) : msg || tc('somethingWentWrong')}
      action={onRetry ? <Button label={tm('retry')} variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

/** Empty screen as an invitation to act. No icon → the brand illustration. */
export function EmptyState({ icon: Icon, title, text, action }: { icon?: IconType; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      {Icon ? (
        <View style={styles.emptyIcon}>
          <Icon size={28} color={brand[600]} strokeWidth={1.8} />
        </View>
      ) : (
        <CareIllustration size={112} />
      )}
      <Text variant="lead" weight="bold" align="center">
        {title}
      </Text>
      {!!text && (
        <Text color={colors.textMuted} align="center">
          {text}
        </Text>
      )}
      {action}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bandLarge: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  bandCompact: { paddingHorizontal: space.md, paddingBottom: space.lg },
  largeTitle: { letterSpacing: -0.6 },
  largeSubtitle: { paddingHorizontal: space.lg, paddingTop: space.md },
  content: { padding: space.lg, gap: space.lg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[200], gap: space.sm },
  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  state: { flex: 1, minHeight: 280 },
  skeleton: { backgroundColor: ink[100], borderRadius: radius.lg },
  skeletonList: { gap: space.md },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
}));
