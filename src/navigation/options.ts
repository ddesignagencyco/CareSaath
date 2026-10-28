import { colors, themed } from '../theme';

/** Shared native-stack options: custom headers, brand background, platform slide. */
export const stackOptions = themed(
  () =>
    ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
      animation: 'slide_from_right',
    }) as const,
);
