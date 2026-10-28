import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, StyleSheet, View } from 'react-native';
import { useSettings, useT } from '../i18n';
import { brandFixed, colors, ink, radius, shadow, space, themed } from '../theme';
import { MapPin, Minus, Plus } from './icons';
import { Text } from './Text';
import { Touchable } from './ui';

/**
 * Drag-to-place map pin drawn from Google Maps tiles (the same map the web
 * app embeds), with no native maps SDK or API key: the map moves under a
 * fixed centre pin (as in ride apps), and the centre is the chosen point.
 *
 * TODO(maps): loading Google's tile server directly is not an officially
 * supported use. Before release, swap this for react-native-maps with the
 * Google provider and a Maps SDK for Android API key (the user's choice,
 * 2026-10-28: Google look now, SDK + key later).
 */
const TILE_URL = (z: number, x: number, y: number, lang: string) => `https://mt${(x + y) % 4}.google.com/vt/lyrs=m&hl=${lang}&x=${x}&y=${y}&z=${z}`;
const TILE_HEADERS = { 'User-Agent': 'CareSath-mobile/1.0' };
const TILE = 256;
const MIN_ZOOM = 5;
const MAX_ZOOM = 19;

/* Web Mercator: degrees <-> world pixels at zoom z. */
const worldSize = (z: number) => TILE * 2 ** z;
function toPixel(lat: number, lng: number, z: number) {
  const s = worldSize(z);
  const r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s };
}
function toLatLng(x: number, y: number, z: number) {
  const s = worldSize(z);
  const n = Math.PI - (2 * Math.PI * y) / s;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / s) * 360 - 180 };
}

export function MapPicker({
  lat,
  lng,
  onChange,
  height = 260,
  initialZoom = 16,
}: {
  lat: number;
  lng: number;
  /** Called when the user lets go of the map, with the new centre. */
  onChange: (lat: number, lng: number) => void;
  height?: number;
  initialZoom?: number;
}) {
  const t = useT('mobile.map');
  const { reduceMotion, locale } = useSettings();
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(initialZoom);
  const [center, setCenter] = useState({ lat, lng });
  const drag = useRef(new Animated.ValueXY()).current;
  const lift = useRef(new Animated.Value(0)).current;
  const latest = useRef({ center, zoom, onChange });
  latest.current = { center, zoom, onChange };

  // Follow outside changes (city picked, "Use my location").
  useEffect(() => {
    setCenter(c => (Math.abs(c.lat - lat) > 1e-7 || Math.abs(c.lng - lng) > 1e-7 ? { lat, lng } : c));
  }, [lat, lng]);

  const pan = useMemo(() => {
    const raise = (v: number) => Animated.timing(lift, { toValue: v, duration: reduceMotion ? 0 : 140, useNativeDriver: true }).start();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the page from scrolling while the map is being dragged.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => raise(1),
      onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        raise(0);
        const { center: c, zoom: z, onChange: done } = latest.current;
        const p = toPixel(c.lat, c.lng, z);
        const next = toLatLng(p.x - g.dx, p.y - g.dy, z);
        drag.setValue({ x: 0, y: 0 });
        setCenter(next);
        done(next.lat, next.lng);
      },
      onPanResponderTerminate: () => {
        raise(0);
        drag.setValue({ x: 0, y: 0 });
      },
    });
  }, [drag, lift, reduceMotion]);

  // Tiles covering the box plus one tile of margin, so a drag never shows gaps.
  const tiles = useMemo(() => {
    if (!width) return [];
    const c = toPixel(center.lat, center.lng, zoom);
    const left = c.x - width / 2;
    const top = c.y - height / 2;
    const n = 2 ** zoom;
    const out: { key: string; uri: string; x: number; y: number }[] = [];
    for (let tx = Math.floor(left / TILE) - 1; tx <= Math.floor((left + width) / TILE) + 1; tx++) {
      for (let ty = Math.floor(top / TILE) - 1; ty <= Math.floor((top + height) / TILE) + 1; ty++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        out.push({ key: `${zoom}/${tx}/${ty}`, uri: TILE_URL(zoom, wx, ty, locale), x: tx * TILE - left, y: ty * TILE - top });
      }
    }
    return out;
  }, [center, zoom, width, height, locale]);

  const zoomBy = (d: number) => setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + d)));

  return (
    <View style={[styles.box, { height }]} onLayout={e => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={t('label')} accessibilityHint={t('hint')}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: drag.getTranslateTransform() }]} {...pan.panHandlers}>
        {tiles.map(tile => (
          <Image key={tile.key} source={{ uri: tile.uri, headers: TILE_HEADERS }} style={[styles.tile, { left: tile.x, top: tile.y }]} fadeDuration={0} accessibilityIgnoresInvertColors />
        ))}
      </Animated.View>

      {/* Fixed centre pin; its tip marks the point. It lifts while dragging. */}
      <View style={styles.pinWrap} pointerEvents="none">
        <Animated.View style={{ transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }] }}>
          <View style={styles.pinHead}>
            <MapPin size={22} color="#fff" strokeWidth={2.4} />
          </View>
          <View style={styles.pinTail} />
        </Animated.View>
        <View style={styles.pinShadow} />
      </View>

      <View style={styles.zoom}>
        <Touchable onPress={() => zoomBy(1)} disabled={zoom >= MAX_ZOOM} accessibilityRole="button" accessibilityLabel={t('zoomIn')} style={styles.zoomBtn}>
          <Plus size={20} color={ink[800]} />
        </Touchable>
        <View style={styles.zoomDivider} />
        <Touchable onPress={() => zoomBy(-1)} disabled={zoom <= MIN_ZOOM} accessibilityRole="button" accessibilityLabel={t('zoomOut')} style={styles.zoomBtn}>
          <Minus size={20} color={ink[800]} />
        </Touchable>
      </View>

      <View style={styles.hintPill} pointerEvents="none">
        <Text variant="caption" weight="semibold" color="#fff" numberOfLines={1}>
          {t('hint')}
        </Text>
      </View>
      <Text variant="caption" color="#333" style={styles.credit}>
        Map data ©Google
      </Text>
    </View>
  );
}

const PIN = 40;

const styles = themed(() =>
  StyleSheet.create({
    box: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#e8eee9', borderWidth: 1, borderColor: colors.border, direction: 'ltr' },
    tile: { position: 'absolute', width: TILE, height: TILE },
    // The pin's tip sits on the exact centre of the box.
    pinWrap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -PIN / 2, marginTop: -(PIN + 10), alignItems: 'center' },
    pinHead: { width: PIN, height: PIN, borderRadius: PIN / 2, backgroundColor: brandFixed[700], alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', ...shadow.pop },
    pinTail: { alignSelf: 'center', width: 3, height: 10, backgroundColor: brandFixed[700], borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
    pinShadow: { width: 12, height: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.3)', marginTop: 1 },
    zoom: { position: 'absolute', right: space.sm, top: space.sm, backgroundColor: '#fff', borderRadius: radius.md, overflow: 'hidden', ...shadow.card },
    zoomBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    zoomDivider: { height: StyleSheet.hairlineWidth, backgroundColor: ink[200] },
    hintPill: { position: 'absolute', left: space.sm, top: space.sm, maxWidth: '70%', backgroundColor: 'rgba(7,37,34,0.72)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 },
    credit: { position: 'absolute', right: 4, bottom: 2, backgroundColor: 'rgba(255,255,255,0.75)', paddingHorizontal: 4, borderRadius: 3, fontSize: 10, lineHeight: 14 },
  }),
);
