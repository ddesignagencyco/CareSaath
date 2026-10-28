import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, ink, space, themed } from '../theme';
import { Text } from '../components/Text';
import type { IconType } from '../components/icons';
import { CountBadge } from '../components/ui';

export type TabMeta = Record<string, { label: string; icon: IconType; badge?: number }>;

/**
 * Bottom tab bar: labels always visible, a rounded brand-50 pill behind the
 * active icon, brand-700 text.
 * Press feedback stays inside that pill (no rectangular ripple across the tab).
 */
export function TabBar({ state, navigation, meta }: BottomTabBarProps & { meta: TabMeta }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const m = meta[route.name];
        const Icon = m.icon;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={m.badge ? `${m.label} (${m.badge})` : m.label}
            style={styles.tab}>
            {({ pressed }) => (
              <>
                <View style={styles.pill}>
                  {/*
                   * The highlight is its own view, mounted already rounded and
                   * coloured. Toggling backgroundColor on one long-lived view
                   * makes Android (Fabric) redraw it with square corners.
                   */}
                  {(focused || pressed) && <View key={focused ? 'on' : 'press'} style={[styles.pillBg, focused ? styles.pillOn : styles.pillPressed]} />}
                  <Icon size={22} color={focused ? brand[700] : ink[500]} strokeWidth={focused ? 2.4 : 2} />
                  {!!m.badge && (
                    <View style={styles.badge}>
                      <CountBadge count={m.badge} />
                    </View>
                  )}
                </View>
                <Text variant="caption" weight="semibold" color={focused ? brand[700] : ink[500]} align="center" numberOfLines={1}>
                  {m.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[100], paddingTop: space.sm },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56, justifyContent: 'center' },
  pill: { width: 60, height: 32, alignItems: 'center', justifyContent: 'center' },
  pillBg: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, borderRadius: 16 },
  pillOn: { backgroundColor: brand[50] },
  pillPressed: { backgroundColor: ink[100] },
  // Unread marker on the icon, as on the web nav (functional, not decoration).
  badge: { position: 'absolute', top: -4, end: 8 },
}));
