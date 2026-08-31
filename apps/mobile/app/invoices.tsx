import { Ionicons } from '@expo/vector-icons';
import type { Invoice, InvoiceStatus } from '@shop/core';
import { useInvoices, useSessionStore } from '@shop/state';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Badge, EmptyState, Screen, Stat, type Tone } from '@/components/ui';
import {
  fontSize,
  money,
  moneyShort,
  radius,
  shortTime,
  spacing,
  today,
  touch,
  useTheme,
} from '@/lib/theme';

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  paid: 'success',
  partially_paid: 'warning',
  unpaid: 'danger',
  cancelled: 'neutral',
  returned: 'neutral',
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  partially_paid: 'Part paid',
  unpaid: 'Unpaid',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

type StatusFilter = 'all' | 'unpaid' | 'partially_paid' | 'paid';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
];

/**
 * The day's bills — the web `InvoicesPage` without the eight-column table,
 * which is unreadable at 390pt wide. Each invoice becomes a two-line row a
 * thumb can hit, and the eight columns collapse to what someone standing at a
 * counter actually asks: which bill, how much, and is it settled.
 *
 * Filtering happens server-side through the same `useInvoices` filter the web
 * passes, so the totals below always describe exactly the rows on screen.
 */
export default function InvoicesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const store = useSessionStore((s) => s.store);

  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<StatusFilter>('all');

  const invoices = useInvoices({
    storeId: store?.id,
    businessDate: date,
    status: status === 'all' ? undefined : status,
  });

  const rows = useMemo(() => invoices.data ?? [], [invoices.data]);
  const billed = useMemo(() => rows.reduce((sum, i) => sum + i.totals.grandTotal, 0), [rows]);
  const outstanding = useMemo(() => rows.reduce((sum, i) => sum + i.amountDue, 0), [rows]);

  const isToday = date === today();

  return (
    <Screen gutter={false}>
      <View style={[styles.controls, { borderBottomColor: colors.border }]}>
        <View style={[styles.dateBar, { backgroundColor: colors.muted }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => setDate((d) => shiftDay(d, -1))}
            style={({ pressed }) => [styles.dateStep, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.foreground} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Showing ${dayLabel(date)}. Jump to today`}
            disabled={isToday}
            onPress={() => setDate(today())}
            style={styles.dateLabelWrap}
          >
            <Text style={[styles.dateLabel, { color: colors.foreground }]}>{dayLabel(date)}</Text>
            {isToday ? null : (
              <Text style={[styles.dateHint, { color: colors.primary }]}>Tap for today</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            disabled={isToday}
            onPress={() => setDate((d) => shiftDay(d, 1))}
            style={({ pressed }) => [
              styles.dateStep,
              { opacity: isToday ? 0.25 : pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.chips}>
          {FILTERS.map((filter) => {
            const active = filter.value === status;
            return (
              <Pressable
                key={filter.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setStatus(filter.value)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.stats}>
          <Stat label="Bills" value={String(rows.length)} icon="receipt-outline" />
          <Stat label="Billed" value={moneyShort(billed)} icon="trending-up-outline" />
          <Stat
            label="Outstanding"
            value={moneyShort(outstanding)}
            tone={outstanding > 0 ? 'danger' : 'default'}
            icon="time-outline"
          />
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(invoice) => invoice.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={invoices.isFetching}
            onRefresh={() => void invoices.refetch()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          invoices.isLoading ? null : (
            <EmptyState
              icon="receipt-outline"
              title={`No ${status === 'all' ? '' : `${STATUS_LABEL[status].toLowerCase()} `}bills`}
              hint={`Nothing matches this filter for ${dayLabel(date).toLowerCase()} at ${store?.name ?? 'this store'}.`}
              actionLabel={status === 'all' ? undefined : 'Show all'}
              onAction={status === 'all' ? undefined : () => setStatus('all')}
            />
          )
        }
        renderItem={({ item }) => (
          <InvoiceRow invoice={item} onPress={() => router.push(`/invoice/${item.id}`)} />
        )}
      />
    </Screen>
  );
}

function InvoiceRow({ invoice, onPress }: { invoice: Invoice; onPress: () => void }) {
  const colors = useTheme();
  const due = invoice.amountDue > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.number}, ${money(invoice.totals.grandTotal)}, ${STATUS_LABEL[invoice.status]}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={[styles.number, { color: colors.foreground }]} numberOfLines={1}>
            {invoice.number}
          </Text>
          <Text style={[styles.total, { color: colors.foreground }]}>
            {money(invoice.totals.grandTotal)}
          </Text>
        </View>

        <View style={styles.rowBottom}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {shortTime(invoice.createdAt)} · {invoice.customerName ?? 'Walk-in'} ·{' '}
            {invoice.lines.length} {invoice.lines.length === 1 ? 'item' : 'items'}
          </Text>
          {due ? (
            <Text style={[styles.due, { color: colors.destructive }]}>
              {money(invoice.amountDue)} due
            </Text>
          ) : null}
          <Badge label={STATUS_LABEL[invoice.status]} tone={STATUS_TONE[invoice.status]} />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * Day arithmetic in UTC to match `today()`, which slices an ISO string — doing
 * it in local time would skip or repeat a day either side of midnight.
 */
const shiftDay = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
};

const dayLabel = (iso: string) => {
  if (iso === today()) return 'Today';
  if (iso === shiftDay(today(), -1)) return 'Yesterday';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const styles = StyleSheet.create({
  controls: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateBar: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg },
  dateStep: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabelWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: touch.min },
  dateLabel: { fontSize: fontSize.base, fontWeight: '700' },
  dateHint: { fontSize: fontSize.xs, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    minHeight: touch.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  list: { padding: spacing.lg },
  row: {
    minHeight: touch.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowMain: { flex: 1, gap: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: { flex: 1, fontSize: fontSize.base, fontWeight: '700' },
  total: { fontSize: fontSize.base, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { flex: 1, fontSize: fontSize.xs },
  due: { fontSize: fontSize.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
