import type { Tender } from '@shop/state';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Field, IconButton, Input, Row, Sheet } from '@/components/ui';
import { fontSize, money, radius, spacing, touch, useTheme } from '@/lib/theme';

export interface PaymentMethodOption {
  id: string;
  name: string;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Payment. The fast path is one tap — a method chip tenders the whole bill —
 * and splitting is there for when a customer pays part cash, part UPI. Cash
 * received is a calculator only: it works out change without ever being sent
 * as a payment, so an over-tendered note can't record more than the invoice.
 */
export function TenderSheet({
  visible,
  onClose,
  total,
  methods,
  onConfirm,
  pending,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  total: number;
  methods: PaymentMethodOption[];
  onConfirm: (tenders: Tender[]) => void;
  pending: boolean;
  error: string | null;
}) {
  const colors = useTheme();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [cashReceived, setCashReceived] = useState('');

  // Every time the sheet opens it starts clean — a stale tender from the last
  // sale silently under-charging the next one would be the worst kind of bug.
  useEffect(() => {
    if (visible) {
      setTenders([]);
      setCashReceived('');
    }
  }, [visible]);

  const tendered = round(tenders.reduce((sum, t) => sum + t.amount, 0));
  const due = Math.max(round(total - tendered), 0);
  const overTendered = tendered > total;

  const received = Number(cashReceived);
  const change =
    cashReceived.trim() !== '' && Number.isFinite(received) ? round(received - total) : null;

  const setSingle = (methodId: string) => setTenders([{ paymentMethodId: methodId, amount: total }]);

  const updateAmount = (index: number, text: string) => {
    const amount = Number(text);
    setTenders((prev) =>
      prev.map((t, i) => (i === index ? { ...t, amount: Number.isFinite(amount) ? amount : 0 } : t)),
    );
  };

  const soleMethodId = tenders.length === 1 ? tenders[0]?.paymentMethodId : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Collect ${money(total)}`}
      description="Tap a method to tender the full amount, or split across several."
      footer={
        <>
          <Button
            label={pending ? 'Billing…' : tenders.length === 0 ? 'Bill and park unpaid' : 'Bill'}
            trailing={money(total)}
            icon="receipt-outline"
            size="lg"
            block
            loading={pending}
            disabled={pending || overTendered}
            variant={tenders.length === 0 ? 'outline' : 'primary'}
            onPress={() => onConfirm(tenders.filter((t) => t.amount > 0))}
          />
          {tenders.length === 0 ? (
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              With no tender the invoice is parked unpaid and can be settled later from Invoices.
            </Text>
          ) : null}
        </>
      }
    >
      <View style={styles.body}>
          <View style={styles.methods}>
            {methods.map((method) => {
              const active = soleMethodId === method.id;
              return (
                <Pressable
                  key={method.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Pay full amount by ${method.name}`}
                  onPress={() => setSingle(method.id)}
                  style={({ pressed }) => [
                    styles.method,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: pressed ? 0.8 : 1,
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
                    {method.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tenders.map((tender, index) => {
            const method = methods.find((m) => m.id === tender.paymentMethodId);
            return (
              <View key={index} style={styles.tenderRow}>
                <View style={styles.tenderText}>
                  <Text style={[styles.tenderName, { color: colors.foreground }]}>
                    {method?.name ?? 'Payment'}
                  </Text>
                </View>
                <Input
                  value={String(tender.amount)}
                  onChangeText={(text) => updateAmount(index, text)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  containerStyle={styles.tenderAmount}
                  style={styles.tenderAmountText}
                />
                <IconButton
                  icon="close"
                  label={`Remove ${method?.name ?? 'payment'}`}
                  variant="ghost"
                  size={36}
                  onPress={() => setTenders((prev) => prev.filter((_, i) => i !== index))}
                />
              </View>
            );
          })}

          {due > 0 && methods.length > 0 ? (
            <Button
              label={`Add another tender for ${money(due)}`}
              icon="add"
              variant="outline"
              size="sm"
              block
              onPress={() =>
                setTenders((prev) => [
                  ...prev,
                  { paymentMethodId: methods[0]!.id, amount: due },
                ])
              }
            />
          ) : null}

          <View style={[styles.summary, { borderColor: colors.border }]}>
            <Row label="Bill total" value={money(total)} />
            <Row label="Tendered" value={money(tendered)} muted />
            <Row
              label={overTendered ? 'Over-tendered' : 'Balance due'}
              value={money(overTendered ? round(tendered - total) : due)}
              tone={overTendered ? 'danger' : due > 0 ? 'danger' : 'success'}
              strong
            />
          </View>

          {overTendered ? (
            <Badge label="Tenders exceed the bill — reduce one to continue" tone="danger" />
          ) : null}

          <Field label="Cash received" hint="Works out change. Never recorded as a payment.">
            <Input
              value={cashReceived}
              onChangeText={setCashReceived}
              keyboardType="decimal-pad"
              placeholder="e.g. 500"
              icon="cash-outline"
              trailing={
                change !== null && change >= 0 ? (
                  <Text style={[styles.change, { color: colors.success }]}>
                    Change {money(change)}
                  </Text>
                ) : change !== null ? (
                  <Text style={[styles.change, { color: colors.destructive }]}>Short</Text>
                ) : undefined
              }
            />
          </Field>

          {error ? (
            <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
          ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.sm },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  method: {
    minHeight: touch.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.full,
  },
  tenderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tenderText: { flex: 1 },
  tenderName: { fontSize: fontSize.base, fontWeight: '600' },
  tenderAmount: { width: 120 },
  tenderAmountText: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  summary: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  change: { fontSize: fontSize.xs, fontWeight: '700' },
  error: { fontSize: fontSize.sm },
  note: { fontSize: fontSize.xs, textAlign: 'center', lineHeight: 16 },
});
