/**
 * Mobile network profiles used by the BE-065 performance suite.
 *
 * The values mirror the Chrome DevTools network-throttling presets so the
 * numbers are comparable with what the team sees in a browser profile, and
 * with the "3G connection" wording of SRS §6 ("Caregiver search results shall
 * load in under 3 seconds on a 3G connection").
 *
 * Bandwidth is expressed in bytes per second; the DevTools presets advertise
 * kilobits/megabits per second, so the conversion (kbps * 1000 / 8) happens
 * here. `latencyMs` is a *round-trip* time: the proxy splits it evenly
 * between the request path and the response path, which is the standard
 * propagation-delay model.
 */
export interface NetworkProfile {
  /** Stable identifier used in reports and assertions. */
  readonly name: string;
  /** Human-readable summary of the emulated link. */
  readonly description: string;
  /** Bytes per second available in the download direction. */
  readonly downloadBytesPerSecond: number;
  /** Bytes per second available in the upload direction. */
  readonly uploadBytesPerSecond: number;
  /** Round-trip latency in milliseconds. */
  readonly latencyMs: number;
}

const kbpsToBytesPerSecond = (kbps: number): number => Math.floor((kbps * 1000) / 8);
const mbpsToBytesPerSecond = (mbps: number): number => Math.floor((mbps * 1000 * 1000) / 8);

/**
 * Chrome DevTools "Slow 3G": 500 Kbps down / 500 Kbps up, 2000 ms RTT.
 * This is the conservative reading of "a 3G connection" and is the profile the
 * SRS §6 budget is enforced against.
 */
export const SLOW_3G: NetworkProfile = {
  name: 'slow-3g',
  description: 'Chrome DevTools "Slow 3G": 500 Kbps down / 500 Kbps up, 2000 ms RTT',
  downloadBytesPerSecond: kbpsToBytesPerSecond(500),
  uploadBytesPerSecond: kbpsToBytesPerSecond(500),
  latencyMs: 2000,
};

/** Chrome DevTools "Fast 3G": 1.6 Mbit/s down / 750 Kbit/s up, 562.5 ms RTT. */
export const FAST_3G: NetworkProfile = {
  name: 'fast-3g',
  description: 'Chrome DevTools "Fast 3G": 1.6 Mbit/s down / 750 Kbit/s up, 562.5 ms RTT',
  downloadBytesPerSecond: mbpsToBytesPerSecond(1.6),
  uploadBytesPerSecond: kbpsToBytesPerSecond(750),
  latencyMs: 562.5,
};

/** Plain UMTS/3G: 780 Kbit/s down / 330 Kbit/s up, 100 ms RTT. */
export const REGULAR_3G: NetworkProfile = {
  name: 'regular-3g',
  description: 'UMTS 3G: 780 Kbit/s down / 330 Kbit/s up, 100 ms RTT',
  downloadBytesPerSecond: kbpsToBytesPerSecond(780),
  uploadBytesPerSecond: kbpsToBytesPerSecond(330),
  latencyMs: 100,
};

export const NETWORK_PROFILES: Record<string, NetworkProfile> = {
  [SLOW_3G.name]: SLOW_3G,
  [FAST_3G.name]: FAST_3G,
  [REGULAR_3G.name]: REGULAR_3G,
};
