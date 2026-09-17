import type { InvoicePage } from '@shop/core';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Row, Sheet } from '@/components/ui';
import { fontSize, money, spacing, useTheme } from '@/lib/theme';

/**
 * The bill as it will be raised, shown before raising it.
 *
 * Rendered from the same `InvoicePage` the printed document is built from, so
 * what a cashier confirms and what the customer is handed cannot drift apart.
 * The number is absent because the counter allocates it on write — there is
 * nothing to show yet, and a plausible-looking stand-in would be worse than
 * none.
 *
 * Native views rather than the HTML renderer: showing HTML would mean a WebView,
 * which is a native module, which means rebuilding and reinstalling the app.
 * The real document is a tap away once the invoice exists.
 */
export function InvoicePreviewSheet({
  visible,
  onClose,
  page,
  onConfirm,
  pending,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  page: InvoicePage;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  const colors = useTheme();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Confirm this bill"
      description="Check it, then raise the invoice. Payment is taken on the bill once it exists."
    >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {page.billFrom ? (
          <View style={styles.block}>
            <Text style={[styles.entity, { color: colors.foreground }]}>
              {page.billFrom.legalName}
            </Text>
            {page.billFrom.gstin ? (
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                GSTIN {page.billFrom.gstin}
              </Text>
            ) : null}
          </View>
        ) : null}

        {page.customerName || page.customerGstin ? (
          <View style={styles.block}>
            {page.customerName ? (
              <Text style={[styles.meta, { color: colors.foreground }]}>{page.customerName}</Text>
            ) : null}
            {page.customerGstin ? (
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                GSTIN {page.customerGstin}
                {page.interState ? ' · inter-state (IGST)' : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.block, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
          {page.lines.map((line, index) => (
            <View key={`${line.name}-${index}`} style={styles.line}>
              <Text style={[styles.lineName, { color: colors.foreground }]} numberOfLines={2}>
                {line.name}
              </Text>
              <Text style={[styles.lineMeta, { color: colors.mutedForeground }]}>
                {line.qty} × {money(line.unitPrice)} · GST {line.taxRate}%
              </Text>
              <Text style={[styles.lineTotal, { color: colors.foreground }]}>
                {money(line.lineTotal)}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.block, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
          <Row label="Taxable value" value={money(page.totals.taxableValue)} muted />
          <Row label="Total tax" value={money(page.totals.taxTotal)} muted />
          {page.totals.roundOff !== 0 ? (
            <Row label="Round off" value={money(page.totals.roundOff)} muted />
          ) : null}
          <Row label="Total" value={money(page.totals.grandTotal)} />
        </View>

        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Invoice number is assigned when the bill is raised.
        </Text>

        {error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        ) : null}
      </ScrollView>

      <Button
        label={pending ? 'Raising…' : 'Raise invoice'}
        trailing={money(page.totals.grandTotal)}
        icon="document-text-outline"
        size="lg"
        block
        disabled={pending || page.lines.length === 0}
        onPress={onConfirm}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 380 },
  block: { gap: spacing.xs, paddingVertical: spacing.sm },
  entity: { fontSize: fontSize.sm, fontWeight: '700' },
  meta: { fontSize: fontSize.xs },
  line: { gap: 2, paddingVertical: spacing.xs },
  lineName: { fontSize: fontSize.sm, fontWeight: '600' },
  lineMeta: { fontSize: fontSize.xs },
  lineTotal: { fontSize: fontSize.sm, fontWeight: '700', textAlign: 'right' },
  note: { fontSize: fontSize.xs, paddingBottom: spacing.sm },
  error: { fontSize: fontSize.xs, paddingBottom: spacing.sm },
});
