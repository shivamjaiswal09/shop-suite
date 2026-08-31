import type { StockLocation } from '@shop/core';
import type { StockRow } from '@shop/state';
import {
  useAccessibleStores,
  useAggregateStockOverview,
  useSessionStore,
  useStockOverview,
  useWarehouses,
} from '@shop/state';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, EmptyState, IconButton, Input, Screen, Stat, StockBadge } from '@/components/ui';
import {
  fontSize,
  money,
  moneyShort,
  qty as fmtQty,
  radius,
  spacing,
  useTheme,
} from '@/lib/theme';

type Scope = 'store' | 'warehouse' | 'all';
type Filter = 'all' | 'low' | 'out';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'store', label: 'Store' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'all', label: 'Total' },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low' },
  { key: 'out', label: 'Out of stock' },
];

/**
 * Stock, split the same three ways as the web app rather than collapsed behind
 * one global location switch — shelf stock and bulk stock are not comparable
 * quantities and should never sit side by side pretending to be. Total is a
 * read-only rollup: a quantity spread across locations is not something you can
 * adjust in one place, so it shows the per-location split instead.
 */
export default function StockScreen() {
  const colors = useTheme();
  const sellingStore = useSessionStore((s) => s.store);

  const stores = useAccessibleStores();
  const warehouses = useWarehouses();

  const [scope, setScope] = useState<Scope>('store');
  const [storeId, setStoreId] = useState<string | undefined>(sellingStore?.id);
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Follow the selling store until the user picks a different one here.
  useEffect(() => {
    setStoreId((current) => current ?? sellingStore?.id);
  }, [sellingStore?.id]);

  // Default to the first warehouse the first time that scope is opened.
  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) setWarehouseId(warehouses.data[0]!.id);
  }, [warehouses.data, warehouseId]);

  const locationList: StockLocation[] = useMemo(
    () => (scope === 'store' ? (stores.data ?? []) : scope === 'warehouse' ? (warehouses.data ?? []) : []),
    [scope, stores.data, warehouses.data],
  );

  const selectedId = scope === 'store' ? storeId : scope === 'warehouse' ? warehouseId : undefined;

  // Every location together, for the read-only rollup.
  const allLocations = useMemo(
    () => (scope === 'all' ? [...(stores.data ?? []), ...(warehouses.data ?? [])] : []),
    [scope, stores.data, warehouses.data],
  );

  // Both hooks always run — the unused one is handed an id/list that makes it
  // a no-op, which keeps hook order stable across scope changes.
  const single = useStockOverview(scope === 'all' ? undefined : selectedId);
  const aggregate = useAggregateStockOverview(allLocations);
  const view = scope === 'all' ? aggregate : single;

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return view.rows.filter((row) => {
      if (filter === 'out' && row.alert !== 'out_of_stock') return false;
      if (filter === 'low' && row.alert !== 'below_min' && row.alert !== 'reorder') return false;
      if (!needle) return true;
      return (
        row.sku.name.toLowerCase().includes(needle) ||
        row.sku.code.toLowerCase().includes(needle) ||
        row.sku.barcode === needle
      );
    });
  }, [view.rows, term, filter]);

  const noWarehouses = scope === 'warehouse' && (warehouses.data ?? []).length === 0;

  return (
    <Screen gutter={false}>
      <View style={styles.header}>
        <View style={styles.segmented}>
          {SCOPES.map((s) => {
            const active = scope === s.key;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setScope(s.key)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? colors.primaryForeground : colors.foreground,
                    fontSize: fontSize.sm,
                    fontWeight: '600',
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.stats}>
          <Stat label="SKUs" value={String(view.summary.skuCount)} />
          <Stat label="Value" value={moneyShort(view.summary.stockValue)} />
          <Stat
            label="Low"
            value={String(view.summary.lowStock)}
            tone={view.summary.lowStock > 0 ? 'warning' : 'default'}
            onPress={() => setFilter(filter === 'low' ? 'all' : 'low')}
          />
          <Stat
            label="Out"
            value={String(view.summary.outOfStock)}
            tone={view.summary.outOfStock > 0 ? 'danger' : 'default'}
            onPress={() => setFilter(filter === 'out' ? 'all' : 'out')}
          />
        </View>

        {scope === 'all' ? (
          <Text style={[styles.rollup, { color: colors.mutedForeground }]}>
            Every location together — read-only. Each row shows where the total sits.
          </Text>
        ) : locationList.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={styles.chipScroll}
          >
            {locationList.map((location) => {
              const active = location.id === selectedId;
              return (
                <Pressable
                  key={location.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    scope === 'store' ? setStoreId(location.id) : setWarehouseId(location.id)
                  }
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
                    {location.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <Input
          icon="search-outline"
          placeholder="Search name, code or barcode"
          value={term}
          onChangeText={setTerm}
          autoCapitalize="none"
          autoCorrect={false}
          trailing={
            term ? (
              <IconButton
                icon="close"
                label="Clear search"
                variant="ghost"
                size={32}
                onPress={() => setTerm('')}
              />
            ) : undefined
          }
        />

        <View style={styles.chipRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accent : 'transparent',
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? colors.primary : colors.mutedForeground,
                    fontSize: fontSize.xs,
                    fontWeight: '600',
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(row) => row.sku.id}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={view.isFetching}
            onRefresh={view.refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          noWarehouses ? (
            <EmptyState
              icon="business-outline"
              title="No warehouses"
              hint="This company has no warehouse locations yet. Add one from the web app under Stores & Warehouses."
            />
          ) : (
            <EmptyState
              icon="cube-outline"
              title={filter === 'all' ? 'No SKUs match' : 'Nothing in this state'}
              hint={
                filter === 'all'
                  ? 'Try a different search term, or clear it to see everything here.'
                  : 'Good news — no items are in this state right now.'
              }
              actionLabel={filter === 'all' ? undefined : 'Show all stock'}
              onAction={filter === 'all' ? undefined : () => setFilter('all')}
            />
          )
        }
        renderItem={({ item }) => <StockCard row={item} />}
      />
    </Screen>
  );
}

function StockCard({ row }: { row: StockRow }) {
  const colors = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleWrap}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
            {row.sku.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {row.sku.code} · {row.sku.barcode}
          </Text>
        </View>
        <StockBadge alert={row.alert} />
      </View>

      <View style={styles.cardBottom}>
        <Cell label="On hand" value={fmtQty(row.level.onHand)} />
        <Cell label="Reserved" value={fmtQty(row.level.reserved)} />
        <Cell label="Available" value={fmtQty(row.level.available)} emphasis />
        <Cell label="Value" value={money(row.level.value)} />
      </View>

      {row.split && row.split.length > 0 ? (
        <View style={[styles.split, { borderTopColor: colors.border }]}>
          {row.split.map((part) => (
            <View key={part.locationId} style={styles.splitRow}>
              <Badge label={part.kind === 'store' ? 'Store' : 'Warehouse'} tone="neutral" />
              <Text style={[styles.splitName, { color: colors.foreground }]} numberOfLines={1}>
                {part.locationName}
              </Text>
              <Text style={[styles.splitQty, { color: colors.mutedForeground }]}>
                {fmtQty(part.onHand)} on hand
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Cell({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  const colors = useTheme();
  return (
    <View style={styles.cell}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{label}</Text>
      <Text
        style={{
          color: colors.foreground,
          fontSize: fontSize.sm,
          fontWeight: emphasis ? '700' : '500',
          fontVariant: ['tabular-nums'],
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  chipScroll: { flexGrow: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  rollup: { fontSize: fontSize.xs, lineHeight: 16 },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['2xl'] },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { fontSize: fontSize.base, fontWeight: '600', lineHeight: 20 },
  cardMeta: { fontSize: fontSize.xs },
  cardBottom: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1, minWidth: 0, gap: 2 },
  split: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  splitName: { flex: 1, fontSize: fontSize.xs, fontWeight: '600' },
  splitQty: { fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
});
