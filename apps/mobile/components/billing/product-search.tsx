import { Ionicons } from '@expo/vector-icons';
import { byCategoryOrder, type Sku } from '@shop/core';
import { useCategories, useCategoryMap, useProducts, useScanLookup, useSkuSearch, useSkus } from '@shop/state';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, IconButton, Input } from '@/components/ui';
import {
  elevation,
  fontSize,
  money,
  qty as fmtQty,
  radius,
  spacing,
  useTheme,
} from '@/lib/theme';

const MAX_RESULTS = 8;
const MAX_BROWSE = 30;

/** Marks the chip that browses every SKU rather than one category. */
const ALL_CATEGORIES = '__all__';

/**
 * The counter's entry point. One field serves both hands-free scanning and
 * thumb typing: a scanner's Enter keystroke resolves an exact barcode and adds
 * the SKU straight to the cart, while a partial term falls through to the same
 * type-ahead the web picker uses. Results overlay the cart rather than pushing
 * it down, so the running bill never jumps around mid-sale.
 *
 * Category chips are the no-scanner path — most phones at a counter have no
 * barcode gun, so browsing a category has to be as reachable as scanning.
 */
export function ProductSearch({
  availableBySku,
  onAdd,
}: {
  availableBySku: Map<string, number>;
  onAdd: (sku: Sku) => void;
}) {
  const colors = useTheme();
  const inputRef = useRef<TextInput>(null);
  const scan = useScanLookup();

  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  const results = useSkuSearch(term);
  const allSkus = useSkus();
  const products = useProducts();
  const categoryList = useCategories();
  const categoryById = useCategoryMap();

  const productById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data],
  );

  /** Sku → its product's category. The join the web picker also does. */
  const categoryOf = (sku: Sku) =>
    categoryById.get(productById.get(sku.productId)?.categoryId ?? '');

  const categories = useMemo(
    () => [...(categoryList.data ?? [])].sort(byCategoryOrder),
    [categoryList.data],
  );

  /**
   * The chip that browses everything. A sentinel rather than null, because null
   * already means "nothing selected" — and without this there was no way to see
   * the whole shelf at all: deselecting a category showed an empty list.
   */
  const allChip = { id: ALL_CATEGORIES, name: 'All' };

  const searching = term.trim().length > 0;
  const browsing = !searching && category !== null;

  const browseSkus = useMemo(() => {
    if (!browsing) return [];
    return (allSkus.data ?? [])
      .filter(
        (sku) =>
          category === ALL_CATEGORIES ||
          productById.get(sku.productId)?.categoryId === category,
      )
      .slice(0, MAX_BROWSE);
  }, [browsing, allSkus.data, productById, category]);

  const add = (sku: Sku) => {
    onAdd(sku);
    setTerm('');
    setNotFound(null);
    // Keep focus so a scanner can fire the next barcode without a tap.
    inputRef.current?.focus();
  };

  /** Enter: exact barcode wins; otherwise leave the term for the result list. */
  const onSubmit = async () => {
    const code = term.trim();
    if (!code) return;
    const sku = await scan(code);
    if (sku) {
      add(sku);
      return;
    }
    const [first] = results.data ?? [];
    if (first) add(first);
    else setNotFound(code);
  };

  const visible = searching ? (results.data ?? []).slice(0, MAX_RESULTS) : browseSkus;

  const renderRow = (sku: Sku, index: number) => {
    const available = availableBySku.get(sku.id) ?? 0;
    const categoryName = categoryOf(sku)?.name;
    return (
      <Pressable
        key={sku.id}
        accessibilityRole="button"
        accessibilityLabel={`Add ${sku.name}${categoryName ? `, ${categoryName}` : ''}, ${money(sku.sellingPrice)}`}
        onPress={() => add(sku)}
        style={({ pressed }) => [
          styles.result,
          index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
          pressed && { backgroundColor: colors.muted },
        ]}
      >
        <View style={styles.resultText}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {sku.name}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {categoryName ?? '—'} · {sku.code} · {money(sku.sellingPrice)}
          </Text>
        </View>

        {available <= 0 ? (
          <Badge label="Out of stock" tone="danger" />
        ) : (
          <Text style={[styles.available, { color: colors.mutedForeground }]}>
            {fmtQty(available)} left
          </Text>
        )}

        <Ionicons name="add-circle" size={26} color={colors.primary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <Input
        ref={inputRef}
        size="lg"
        icon="barcode-outline"
        placeholder="Scan barcode or search"
        value={term}
        onChangeText={(next) => {
          setTerm(next);
          setNotFound(null);
        }}
        onSubmitEditing={() => void onSubmit()}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        trailing={
          term ? (
            <IconButton icon="close" label="Clear search" variant="ghost" size={32} onPress={() => setTerm('')} />
          ) : undefined
        }
      />

      {!searching && categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {[allChip, ...categories].map((c) => {
            const active = category === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  c.id === ALL_CATEGORIES ? 'Browse all items' : `Browse ${c.name}`
                }
                onPress={() => setCategory(active ? null : c.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? colors.primaryForeground : colors.foreground,
                    fontSize: fontSize.xs,
                    fontWeight: '600',
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {searching || browsing ? (
        <View
          style={[
            styles.results,
            elevation.raised,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {notFound ? (
            <Text style={[styles.empty, { color: colors.destructive }]}>
              No SKU with barcode or name “{notFound}”.
            </Text>
          ) : visible.length === 0 ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              {results.isFetching ? 'Searching…' : 'Nothing matches that.'}
            </Text>
          ) : (
            <ScrollView
              style={styles.resultScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {visible.map(renderRow)}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 10 },
  chipScroll: { marginTop: spacing.sm, flexGrow: 0 },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  results: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  resultScroll: { maxHeight: 320 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  resultText: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.base, fontWeight: '600' },
  meta: { fontSize: fontSize.xs },
  available: { fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  empty: { padding: spacing.lg, fontSize: fontSize.sm, textAlign: 'center' },
});
