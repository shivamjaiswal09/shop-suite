import { Ionicons } from '@expo/vector-icons';
import type { InvoiceStatus } from '@shop/core';
import { useInvoice, useInvoicePayments, usePaymentMethods } from '@shop/state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Row,
  ScrollScreen,
  type Tone,
} from '@/components/ui';
import { fontSize, money, qty as fmtQty, shortTime, spacing, useTheme } from '@/lib/theme';

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

/**
 * The confirmation a cashier needs after pressing Bill: what was sold, what was
 * collected, and whether anything is still owed. Reached automatically after a
 * sale, and deep-linkable on its own.
 */
export default function InvoiceScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const invoice = useInvoice(id);
  const payments = useInvoicePayments(id);
  const methods = usePaymentMethods();

  if (invoice.isLoading) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!invoice.data) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="document-outline"
          title="Invoice not found"
          hint="It may have been cancelled, or the link is stale."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const inv = invoice.data;
  const methodName = (methodId: string) =>
    methods.data?.find((m) => m.id === methodId)?.name ?? 'Payment';

  return (
    <ScrollScreen>
      <View style={styles.hero}>
        <View style={[styles.tick, { backgroundColor: colors.success }]}>
          <Ionicons name="checkmark" size={30} color={colors.successForeground} />
        </View>
        <Text style={[styles.total, { color: colors.foreground }]}>
          {money(inv.totals.grandTotal)}
        </Text>
        <Text style={[styles.number, { color: colors.mutedForeground }]}>
          {inv.number} · {shortTime(inv.createdAt)}
        </Text>
        <Badge label={STATUS_LABEL[inv.status]} tone={STATUS_TONE[inv.status]} />
      </View>

      <Card>
        <CardHeader
          title="Items"
          description={inv.customerName ? `Billed to ${inv.customerName}` : 'Walk-in customer'}
        />
        <CardBody>
          {inv.lines.map((line) => (
            <View key={line.id} style={styles.line}>
              <View style={styles.lineText}>
                <Text style={[styles.lineName, { color: colors.foreground }]} numberOfLines={2}>
                  {line.name}
                </Text>
                <Text style={[styles.lineMeta, { color: colors.mutedForeground }]}>
                  {fmtQty(line.qty)} × {money(line.unitPrice)}
                  {line.discount > 0 ? ` · − ${money(line.discount)}` : ''}
                </Text>
              </View>
              <Text style={[styles.lineTotal, { color: colors.foreground }]}>
                {money(line.lineTotal)}
              </Text>
            </View>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Totals" />
        <CardBody>
          <Row label="Taxable value" value={money(inv.totals.taxableValue)} muted />
          <Row label="Tax" value={money(inv.totals.taxTotal)} muted />
          {inv.totals.roundOff !== 0 ? (
            <Row label="Round off" value={money(inv.totals.roundOff)} muted />
          ) : null}
          <Row label="Grand total" value={money(inv.totals.grandTotal)} strong />
          <Row label="Paid" value={money(inv.amountPaid)} tone="success" />
          {inv.amountDue > 0 ? (
            <Row label="Still due" value={money(inv.amountDue)} tone="danger" strong />
          ) : null}
        </CardBody>
      </Card>

      {(payments.data ?? []).length > 0 ? (
        <Card>
          <CardHeader title="Payments" description="One row per tender." />
          <CardBody>
            {(payments.data ?? []).map((payment) => (
              <Row
                key={payment.id}
                label={`${methodName(payment.paymentMethodId)}${payment.reference ? ` · ${payment.reference}` : ''}`}
                value={money(payment.amount)}
              />
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Button
        label="Start next bill"
        icon="add-circle-outline"
        size="lg"
        block
        onPress={() => router.dismissTo('/(tabs)/bill')}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  tick: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  total: { fontSize: fontSize['3xl'], fontWeight: '700', fontVariant: ['tabular-nums'] },
  number: { fontSize: fontSize.sm, marginBottom: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  lineText: { flex: 1, gap: 2 },
  lineName: { fontSize: fontSize.sm, fontWeight: '600', lineHeight: 18 },
  lineMeta: { fontSize: fontSize.xs },
  lineTotal: { fontSize: fontSize.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
