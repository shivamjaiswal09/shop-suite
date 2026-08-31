import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconName } from './button';
import { elevation, fontSize, radius, spacing, useTheme } from '@/lib/theme';

export type StatTone = 'default' | 'warning' | 'danger' | 'success';

/**
 * A metric tile. Sized so four fit across a small phone without the value
 * truncating — pass already-shortened text (see `moneyShort`) for big figures.
 */
export function Stat({
  label,
  value,
  tone = 'default',
  icon,
  onPress,
}: {
  label: string;
  value: string;
  tone?: StatTone;
  icon?: IconName;
  onPress?: () => void;
}) {
  const colors = useTheme();
  const color =
    tone === 'danger'
      ? colors.destructive
      : tone === 'warning'
        ? colors.warning
        : tone === 'success'
          ? colors.success
          : colors.foreground;

  const body = (
    <>
      <View style={styles.labelRow}>
        {icon ? <Ionicons name={icon} size={12} color={colors.mutedForeground} /> : null}
        <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[styles.tile, elevation.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        elevation.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: { flexShrink: 1, fontSize: fontSize.xs, fontWeight: '600' },
  value: { fontSize: fontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
