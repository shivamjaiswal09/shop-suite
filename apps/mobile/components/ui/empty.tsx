import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button, type IconName } from './button';
import { fontSize, spacing, useTheme } from '@/lib/theme';

/**
 * Empty states say what to do next, not just that there is nothing here —
 * a blank screen at a counter is a stuck cashier.
 */
export function EmptyState({
  icon = 'cube-outline',
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.circle, { backgroundColor: colors.muted }]}>
        <Ionicons name={icon} size={26} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="outline" size="sm" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing['2xl'], paddingHorizontal: spacing.xl },
  circle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.base, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
});
