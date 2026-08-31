import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { elevation, fontSize, radius, spacing, useTheme } from '@/lib/theme';

export function Card({
  children,
  style,
  padded,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Adds the standard inset. Leave off when the card holds its own list rows. */
  padded?: boolean;
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.card,
        elevation.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        padded && { padding: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.headerText}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {description ? (
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function CardBody({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.body, style]}>{children}</View>;
}

/** A label/value line — the workhorse of every summary panel in the app. */
export function Row({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: 'default' | 'danger' | 'success';
}) {
  const colors = useTheme();
  const valueColor =
    tone === 'danger' ? colors.destructive : tone === 'success' ? colors.success : colors.foreground;

  return (
    <View style={styles.row}>
      <Text
        style={{
          color: muted ? colors.mutedForeground : colors.foreground,
          fontSize: strong ? fontSize.base : fontSize.sm,
          fontWeight: strong ? '600' : '400',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: muted ? colors.mutedForeground : valueColor,
          fontSize: strong ? fontSize.lg : fontSize.sm,
          fontWeight: strong ? '700' : '500',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  const colors = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.base, fontWeight: '600' },
  description: { fontSize: fontSize.xs, lineHeight: 16 },
  body: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
