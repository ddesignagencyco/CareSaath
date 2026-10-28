import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, ink, radius, shadow, space, themed, brandFixed, activeScheme } from '../theme';
import { useSettings, useT } from '../i18n';
import { CircleAlert, CircleCheck, X } from './icons';
import { Text } from './Text';
import { Button, IconButton } from './ui';

/* ---- Bottom sheet -------------------------------------------------------- */

/**
 * Bottom sheet on a transparent Modal: the backdrop fades while the panel
 * slides, both on the native driver. Stays mounted until the exit finishes.
 * Android back closes it (onRequestClose).
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  scroll = true,
  scrollRef,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  /** The body's ScrollView, e.g. to bring the selected option into view. */
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { isRTL } = useSettings();
  const tc = useT('common.actions');
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const { reduceMotion } = useSettings();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: reduceMotion ? 0 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: reduceMotion ? 0 : 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, mounted, anim, reduceMotion]);

  if (!mounted) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });

  return (
    <Modal transparent visible onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent animationType="none">
      <View style={[styles.fill, { direction: isRTL ? 'rtl' : 'ltr' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityLabel={tc('close')} />
        </Animated.View>
        <KeyboardAvoidingView behavior="padding" style={styles.sheetHost} pointerEvents="box-none">
          <Animated.View style={[styles.sheet, { maxHeight: height * 0.88, paddingBottom: insets.bottom + space.lg, transform: [{ translateY }] }]}>
            <View style={styles.grabber} />
            {!!title && (
              <View style={styles.sheetHeader}>
                <Text variant="title" weight="bold" style={styles.flex} accessibilityRole="header">
                  {title}
                </Text>
                <IconButton icon={X} label={tc('close')} onPress={onClose} />
              </View>
            )}
            {scroll ? (
              <ScrollView ref={scrollRef} style={styles.sheetBody} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <View style={styles.sheetBody}>{children}</View>
            )}
            {!!footer && <View style={styles.sheetFooter}>{footer}</View>}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Yes/no question in a sheet; the destructive choice sits away from the thumb's resting spot (top of the pair). */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  danger,
  success,
  loading,
  onConfirm,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Positive confirmation (green), e.g. confirming cash received. */
  success?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const tc = useT('common.actions');
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <View style={styles.confirmButtons}>
          <Button label={confirmLabel} variant={danger ? 'danger' : success ? 'success' : 'primary'} onPress={onConfirm} loading={loading} block size="lg" />
          <Button label={tc('cancel')} variant="secondary" onPress={onClose} block />
        </View>
      }>
      {!!body && <Text color={colors.textMuted}>{body}</Text>}
      {children}
    </Sheet>
  );
}

/* ---- Toast --------------------------------------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ id: number; kind: ToastKind; msg: string } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback(
    (kind: ToastKind, msg: string) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), kind, msg });
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(hide, kind === 'error' ? 5000 : 3200);
    },
    [anim, hide],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: m => show('success', m), error: m => show('error', m), info: m => show('info', m) }),
    [show],
  );

  const Icon = toast?.kind === 'error' ? CircleAlert : CircleCheck;
  // Green tick for success, red for errors, teal for neutral info.
  const tint = toast?.kind === 'error' ? '#f87171' : toast?.kind === 'success' ? '#4ade80' : brandFixed[300];

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.toastHost,
            { top: insets.top + space.sm, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
          ]}>
          <Pressable onPress={hide} style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Icon size={20} color={tint} strokeWidth={2.4} />
            <Text variant="small" weight="semibold" color="#fff" style={styles.flex}>
              {toast.msg}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  fill: { flex: 1 },
  backdrop: { backgroundColor: colors.scrim },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow.pop },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: ink[200], marginTop: space.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingStart: space.xl, paddingEnd: space.sm, paddingTop: space.xs },
  sheetBody: { flexGrow: 0 },
  sheetContent: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  sheetFooter: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[200] },
  confirmButtons: { gap: space.sm },
  toastHost: { position: 'absolute', left: space.lg, right: space.lg, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: activeScheme() === 'dark' ? brandFixed[800] : brandFixed[950], borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, ...shadow.pop },
}));
