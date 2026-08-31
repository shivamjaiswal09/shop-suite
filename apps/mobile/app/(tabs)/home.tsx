import { Ionicons } from '@expo/vector-icons';
import {
  useCan,
  useCanAny,
  useDiscrepancies,
  useInvoices,
  useSessionStore,
  useStockOverview,
} from '@shop/state';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Row,
  ScrollScreen,
  SectionTitle,
  Stat,
  type IconName,
} from '@/components/ui';
import {
  elevation,
  fontSize,
  money,
  moneyShort,
  radius,
  shortTime,
  spacing,
  today,
  useTheme,
} from '@/lib/theme';

/**
 * The landing screen answers two questions in one glance: what has today done
 * so far, and what needs a person. Everything below the fold is a shortcut — the
 * primary action is billing, because that is what the app is opened to do.
 */
export default function HomeScreen() {
  const colors = useTheme();
  const router = useRouter();

  const user = useSessionStore((s) => s.user);
  const store = useSessionStore((s) => s.store);
  const businessDate = today();

  const canBill = useCan('sales.bill');
  const canViewInventory = useCan('inventory.view');
  const canClose = useCanAny(['closing.perform', 'closing.approve']);

  const invoices = useInvoices({ storeId: store?.id, businessDate });
  const stock = useStockOverview(store?.id);
  const discrepancies = useDiscrepancies(store?.id);

  const todays = useMemo(() => invoices.data ?? [], [invoices.data]);

  const takings = useMemo(
    () => todays.reduce((sum, inv) => sum + inv.totals.grandTotal, 0),
    [todays],
  );
  const unpaid = useMemo(
    () => todays.filter((inv) => inv.status === 'unpaid' || inv.status === 'partially_paid'),
    [todays],
  );
  const outstanding = useMemo(
    () => unpaid.reduce((sum, inv) => sum + inv.amountDue, 0),
    [unpaid],
  );
  const openDiscrepancies = useMemo(
    () => (discrepancies.data ?? []).filter((d) => d.status === 'open'),
    [discrepancies.data],
  );

  const recent = todays.slice(0, 5);
  const refreshing = invoices.isFetching || stock.isFetching;

  return (
    <ScrollScreen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void invoices.refetch();
            stock.refetch();
            void discrepancies.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View>
        <Text style={[styles.greeting, { color: colors.foreground }]}>
          {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {store?.name ?? '—'} · {new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}
        </Text>
      </View>

      {canBill ? (
        <Button
          label="New bill"
          icon="barcode-outline"
          size="lg"
          block
          onPress={() => router.push('/(tabs)/bill')}
        />
      ) : null}

      <View style={styles.stats}>
        <Stat label="Today" value={moneyShort(takings)} icon="trending-up-outline" />
        <Stat label="Bills" value={String(todays.length)} icon="receipt-outline" />
        <Stat
          label="Unpaid"
          value={String(unpaid.length)}
          tone={unpaid.length > 0 ? 'warning' : 'default'}
          icon="time-outline"
        />
        <Stat
          label="Out"
          value={String(stock.summary.outOfStock)}
          tone={stock.summary.outOfStock > 0 ? 'danger' : 'default'}
          icon="alert-circle-outline"
          onPress={canViewInventory ? () => router.push('/(tabs)/stock') : undefined}
        />
      </View>

      {unpaid.length > 0 || openDiscrepancies.length > 0 || stock.summary.lowStock > 0 ? (
        <Card>
          <CardHeader title="Needs attention" />
          <CardBody>
            {unpaid.length > 0 ? (
              <Row
                label={`${unpaid.length} unpaid ${unpaid.length === 1 ? 'bill' : 'bills'}`}
                value={money(outstanding)}
                tone="danger"
              />
            ) : null}
            {stock.summary.lowStock > 0 ? (
              <Row
                label="SKUs at or below reorder level"
                value={String(stock.summary.lowStock)}
                tone="danger"
              />
            ) : null}
            {openDiscrepancies.length > 0 ? (
              <Row
                label="Open discrepancies"
                value={String(openDiscrepancies.length)}
                tone="danger"
              />
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <View>
        <SectionTitle title="Shortcuts" />
        <View style={styles.shortcuts}>
          {canViewInventory ? (
            <Shortcut icon="cube-outline" label="Stock" onPress={() => router.push('/(tabs)/stock')} />
          ) : null}
          {canClose ? (
            <Shortcut
              icon="checkmark-done-circle-outline"
              label="Day-end"
              onPress={() => router.push('/(tabs)/closing')}
            />
          ) : null}
          {/* Invoices earns a shortcut where More does not — More is already a
              tab, but the invoice list has no permanent home in the tab bar. */}
          {canBill ? (
            <Shortcut
              icon="receipt-outline"
              label="Invoices"
              onPress={() => router.push('/invoices')}
            />
          ) : null}
        </View>
      </View>

      <Card>
        <CardHeader
          title="Recent bills"
          description="Today, newest first"
          action={
            canBill ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`See all ${todays.length} bills`}
                onPress={() => router.push('/invoices')}
                hitSlop={8}
              >
                <Text style={[styles.seeAll, { color: colors.primary }]}>
                  See all {todays.length > 0 ? `(${todays.length})` : ''}
                </Text>
              </Pressable>
            ) : (
              <Badge label={`${todays.length}`} tone="neutral" />
            )
          }
        />
        {recent.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No sales yet today"
            hint="The first bill of the day will show up here."
            actionLabel={canBill ? 'Start billing' : undefined}
            onAction={canBill ? () => router.push('/(tabs)/bill') : undefined}
          />
        ) : (
          <CardBody>
            {recent.map((invoice) => (
              <Pressable
                key={invoice.id}
                accessibilityRole="button"
                accessibilityLabel={`Invoice ${invoice.number}, ${money(invoice.totals.grandTotal)}`}
                onPress={() => router.push(`/invoice/${invoice.id}`)}
                style={({ pressed }) => [styles.invoice, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.invoiceText}>
                  <Text style={[styles.invoiceNumber, { color: colors.foreground }]}>
                    {invoice.number}
                  </Text>
                  <Text style={[styles.invoiceMeta, { color: colors.mutedForeground }]}>
                    {shortTime(invoice.createdAt)} · {invoice.customerName ?? 'Walk-in'}
                  </Text>
                </View>
                {invoice.amountDue > 0 ? <Badge label="Due" tone="danger" /> : null}
                <Text style={[styles.invoiceTotal, { color: colors.foreground }]}>
                  {money(invoice.totals.grandTotal)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </CardBody>
        )}
      </Card>
    </ScrollScreen>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcut,
        elevation.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={[styles.shortcutLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize['2xl'], fontWeight: '700' },
  sub: { fontSize: fontSize.sm, marginTop: 2 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  shortcuts: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  shortcutLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  seeAll: { fontSize: fontSize.sm, fontWeight: '700' },
  invoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  invoiceText: { flex: 1, gap: 2 },
  invoiceNumber: { fontSize: fontSize.sm, fontWeight: '600' },
  invoiceMeta: { fontSize: fontSize.xs },
  invoiceTotal: { fontSize: fontSize.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
