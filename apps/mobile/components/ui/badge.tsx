import type { StockAlert } from '@shop/core';
import { StyleSheet, Text, View } from 'react-native';
import { fontSize, radius, spacing, useTheme, type ColorScale } from '@/lib/theme';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function toneColors(tone: Tone, colors: ColorScale) {
  switch (tone) {
    case 'success':
      return { bg: colors.success, fg: colors.successForeground };
    case 'warning':
      return { bg: colors.warning, fg: colors.warningForeground };
    case 'danger':
      return { bg: colors.destructive, fg: colors.destructiveForeground };
    case 'info':
      return { bg: colors.primary, fg: colors.primaryForeground };
    case 'neutral':
      return { bg: colors.muted, fg: colors.mutedForeground };
  }
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const colors = useTheme();
  const t = toneColors(tone, colors);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** The stock alert vocabulary, kept identical to the web `StockBadge`. */
export function StockBadge({ alert }: { alert: StockAlert }) {
  if (alert === 'out_of_stock') return <Badge label="Out of stock" tone="danger" />;
  if (alert === 'below_min') return <Badge label="Below min" tone="danger" />;
  if (alert === 'reorder') return <Badge label="Reorder" tone="warning" />;
  return <Badge label="OK" tone="success" />;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  text: { fontSize: fontSize.xs, fontWeight: '700' },
});
