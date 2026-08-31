import { Ionicons } from '@expo/vector-icons';
import type { Sku } from '@shop/core';
import {
  useCartPricing,
  useCartStore,
  useCategoryMap,
  useCheckout,
  usePaymentMethods,
  useProducts,
  useSessionStore,
  useStockOverview,
  type CartLine as CartLineModel,
  type Tender,
} from '@shop/state';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { CartLine } from '@/components/billing/cart-line';
import { LineSheet } from '@/components/billing/line-sheet';
import { ProductSearch } from '@/components/billing/product-search';
import { TenderSheet } from '@/components/billing/tender-sheet';
import { Button, EmptyState, Row, Screen } from '@/components/ui';
import { elevation, fontSize, money, radius, spacing, useTheme } from '@/lib/theme';

/**
 * Quick Billing, thumb-first. Search sits at the top under the scanner's reach,
 * the running bill fills the middle, and the total plus the one action that
 * matters are pinned to the bottom where a thumb rests. Everything below the
 * fold on web — tax breakup, price overrides, split tenders — is still here,
 * folded behind a tap rather than dropped.
 */
export default function BillScreen() {
  const colors = useTheme();
  const router = useRouter();

  const store = useSessionStore((s) => s.store);
  const user = useSessionStore((s) => s.user);
  const counterId = useSessionStore((s) => s.counterId);

  const cart = useCartStore();
  const { lines, totals, taxRows } = useCartPricing();
  const stock = useStockOverview(store?.id);
  const paymentMethods = usePaymentMethods();
  const products = useProducts();
  const categoryById = useCategoryMap();
  const checkout = useCheckout();

  const [editing, setEditing] = useState<CartLineModel | null>(null);
  const [tenderOpen, setTenderOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const availableBySku = useMemo(
    () => new Map(stock.rows.map((row) => [row.sku.id, row.level.available])),
    [stock.rows],
  );
  const pricedByLine = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  // Sku → Product → Category. Resolved once here rather than per row.
  const categoryByProduct = useMemo(
    () =>
      new Map(
        (products.data ?? []).map((p) => [p.id, categoryById.get(p.categoryId)?.name ?? '']),
      ),
    [products.data, categoryById],
  );

  const itemCount = cart.lines.reduce((sum, l) => sum + l.qty, 0);
  const empty = cart.lines.length === 0;

  const onBill = async (tenders: Tender[]) => {
    if (!store || !user || cart.lines.length === 0) return;
    const result = await checkout.mutateAsync({
      storeId: store.id,
      counterId,
      customerId: cart.customerId,
      customerName: cart.customerName,
      lines: cart.lines.map((l) => ({
        skuId: l.sku.id,
        qty: l.qty,
        discount: l.discount,
        unitPriceOverride: l.unitPriceOverride,
        overrideBasis: l.overrideBasis,
      })),
      tenders,
      createdBy: user.id,
    });
    cart.clear();
    setTenderOpen(false);
    router.push(`/invoice/${result.invoice.id}`);
  };

  return (
    <Screen gutter={false}>
      <View style={[styles.context, { borderBottomColor: colors.border }]}>
        <Ionicons name="storefront-outline" size={14} color={colors.mutedForeground} />
        <Text style={[styles.contextText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {store?.name ?? '—'} · Counter {counterId.replace('counter-', '')}
        </Text>
        {empty ? null : (
          <Pressable accessibilityRole="button" onPress={() => cart.clear()} hitSlop={8}>
            <Text style={[styles.clear, { color: colors.destructive }]}>Clear bill</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.searchWrap}>
        <ProductSearch availableBySku={availableBySku} onAdd={(sku: Sku) => cart.addSku(sku, 1)} />
      </View>

      <FlatList
        data={cart.lines}
        keyExtractor={(line) => line.lineId}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="barcode-outline"
            title="No items yet"
            hint="Scan a barcode, search, or tap a category above to browse. A scanner's Enter key adds the item straight away."
          />
        }
        renderItem={({ item }) => (
          <CartLine
            line={item}
            priced={pricedByLine.get(item.lineId)}
            available={availableBySku.get(item.sku.id)}
            category={categoryByProduct.get(item.sku.productId) || undefined}
            onQty={(next) => cart.setQty(item.lineId, next)}
            onRemove={() => cart.remove(item.lineId)}
            onEdit={() => setEditing(item)}
          />
        )}
      />

      {empty ? null : (
        <View
          style={[
            styles.bar,
            elevation.raised,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          {detailOpen ? (
            <View style={styles.detail}>
              <Row label="Sub total" value={money(totals.subTotal)} />
              {totals.discountTotal > 0 ? (
                <Row label="Discount" value={`− ${money(totals.discountTotal)}`} muted />
              ) : null}
              <Row label="Taxable value" value={money(totals.taxableValue)} muted />
              {taxRows.map((row) => (
                <Row
                  key={row.rate}
                  label={`GST @ ${row.rate}% (CGST ${money(row.cgst)} + SGST ${money(row.sgst)})`}
                  value={money(row.cgst + row.sgst)}
                  muted
                />
              ))}
              <Row label="Total tax" value={money(totals.taxTotal)} />
              {totals.roundOff !== 0 ? (
                <Row label="Round off" value={money(totals.roundOff)} muted />
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              detailOpen ? 'Hide bill breakdown' : 'Show bill breakdown including tax'
            }
            onPress={() => setDetailOpen((open) => !open)}
            style={styles.summaryToggle}
          >
            <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'} · incl. {money(totals.taxTotal)} tax
            </Text>
            <Ionicons
              name={detailOpen ? 'chevron-down' : 'chevron-up'}
              size={16}
              color={colors.mutedForeground}
            />
          </Pressable>

          <Button
            label="Charge"
            trailing={money(totals.grandTotal)}
            icon="card-outline"
            size="lg"
            block
            disabled={checkout.isPending || totals.grandTotal <= 0}
            onPress={() => setTenderOpen(true)}
          />
        </View>
      )}

      <LineSheet line={editing} onClose={() => setEditing(null)} />

      <TenderSheet
        visible={tenderOpen}
        onClose={() => setTenderOpen(false)}
        total={totals.grandTotal}
        methods={paymentMethods.data ?? []}
        onConfirm={(tenders) => void onBill(tenders)}
        pending={checkout.isPending}
        error={checkout.error ? (checkout.error as Error).message : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextText: { flex: 1, fontSize: fontSize.xs, fontWeight: '500' },
  clear: { fontSize: fontSize.xs, fontWeight: '700' },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, zIndex: 10 },
  listFlex: { flex: 1 },
  list: { padding: spacing.lg, gap: 0 },
  bar: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  detail: { gap: spacing.xs, paddingBottom: spacing.sm },
  summaryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  itemCount: { fontSize: fontSize.xs, fontWeight: '600' },
});
