import type { SaleLine } from '@shop/core';
import type { CartLine as CartLineModel } from '@shop/state';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, IconButton, Stepper } from '@/components/ui';
import { fontSize, money, qty as fmtQty, radius, spacing, useTheme } from '@/lib/theme';

/**
 * One line of the running bill. The whole row is tappable to open line options
 * (exact quantity, discount, manual price) so the common case stays two taps on
 * the stepper and the rare case is never more than one tap away.
 */
export function CartLine({
  line,
  priced,
  available,
  category,
  onQty,
  onRemove,
  onEdit,
}: {
  line: CartLineModel;
  priced: SaleLine | undefined;
  available: number | undefined;
  /** The SKU's category name, joined through its product. */
  category: string | undefined;
  onQty: (next: number) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const colors = useTheme();
  if (!priced) return null;

  const overselling = available !== undefined && line.qty > available;
  const overridden = line.unitPriceOverride !== undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${line.sku.name}, quantity ${line.qty}, ${money(priced.lineTotal)}. Opens line options.`}
      onPress={onEdit}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: overselling ? colors.destructive : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.top}>
        <View style={styles.titleWrap}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
            {line.sku.name}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {category ? `${category} · ` : ''}
            {money(priced.unitPrice)} each
            {available !== undefined ? ` · ${fmtQty(available)} available` : ''}
          </Text>
        </View>

        <IconButton icon="trash-outline" label={`Remove ${line.sku.name}`} variant="ghost" size={36} onPress={onRemove} />
      </View>

      {overselling || overridden || line.discount > 0 ? (
        <View style={styles.flags}>
          {overselling ? <Badge label="Exceeds available stock" tone="danger" /> : null}
          {overridden ? <Badge label="Manual price" tone="info" /> : null}
          {line.discount > 0 ? <Badge label={`− ${money(line.discount)}`} tone="warning" /> : null}
        </View>
      ) : null}

      <View style={styles.bottom}>
        <Stepper value={line.qty} onChange={onQty} min={0} onPressValue={onEdit} />
        <View style={styles.totals}>
          <Text style={[styles.total, { color: colors.foreground }]}>{money(priced.lineTotal)}</Text>
          <Text style={[styles.tax, { color: colors.mutedForeground }]}>
            incl. {money(priced.taxAmount)} tax @ {priced.taxRate}%
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleWrap: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.base, fontWeight: '600', lineHeight: 20 },
  meta: { fontSize: fontSize.xs },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  totals: { alignItems: 'flex-end', gap: 1 },
  total: { fontSize: fontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tax: { fontSize: fontSize.xs },
});
