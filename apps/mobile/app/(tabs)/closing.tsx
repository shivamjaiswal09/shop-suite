import {
  useApproveClosing,
  useCan,
  useClosingPreview,
  useDiscrepancies,
  useSessionStore,
  useSubmitClosing,
} from '@shop/state';
import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  EmptyState,
  Field,
  Input,
  Row,
  ScrollScreen,
  type Tone,
} from '@/components/ui';
import { fontSize, money, spacing, today, useTheme } from '@/lib/theme';

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Day-end closing, phone-sized. The counting step is the only thing a person
 * does here, so it is one field; everything else is the shared preview folded
 * from the day's payments. A variance beyond ₹1 raises a Discrepancy on submit —
 * that is the shared layer's rule, not a mobile one.
 */
export default function ClosingScreen() {
  const colors = useTheme();
  const store = useSessionStore((s) => s.store);
  const user = useSessionStore((s) => s.user);
  const counterId = useSessionStore((s) => s.counterId);
  const businessDate = today();

  const request = store ? { storeId: store.id, counterId, businessDate } : undefined;
  const preview = useClosingPreview(request);
  const discrepancies = useDiscrepancies(store?.id);
  const submit = useSubmitClosing();
  const approve = useApproveClosing();

  const canPerform = useCan('closing.perform');
  const canApprove = useCan('closing.approve');

  const [physicalCash, setPhysicalCash] = useState('');
  const [note, setNote] = useState('');

  const existing = preview.data?.existing;

  // Seed the count from an already-submitted closing so the figure a person
  // typed earlier is never silently lost when they come back to approve it.
  useEffect(() => {
    if (existing) setPhysicalCash(String(existing.physicalCash));
  }, [existing]);

  if (!store) return null;

  if (preview.isLoading) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const data = preview.data;
  const expected = data?.expectedCash ?? 0;
  const counted = Number(physicalCash);
  const hasCount = physicalCash.trim() !== '' && Number.isFinite(counted);
  const variance = hasCount ? round(counted - expected) : 0;
  const openDiscrepancies = (discrepancies.data ?? []).filter(
    (d) => d.status === 'open' || d.status === 'investigating',
  );

  const onSubmit = () => {
    if (!data || !user || !hasCount) return;
    submit.mutate({
      storeId: store.id,
      counterId,
      businessDate,
      openingCash: data.openingCash,
      physicalCash: counted,
      depositedAmount: 0,
      carriedForward: 0,
      note: note.trim() || undefined,
      submittedBy: user.id,
    });
  };

  return (
    <ScrollScreen
      refreshControl={
        <RefreshControl
          refreshing={preview.isFetching}
          onRefresh={() => void preview.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <Card>
        <CardHeader
          title="Today's sales"
          description={`${store.name} · counter ${counterId.replace('counter-', '')} · ${businessDate}`}
          action={
            existing ? (
              <Badge label={statusLabel(existing.status)} tone={statusTone(existing.status)} />
            ) : null
          }
        />
        <CardBody>
          <Row label="Invoices" value={String(data?.invoiceCount ?? 0)} muted />
          <Row label="Total sales" value={money(data?.totalSales ?? 0)} strong />
          <Divider />
          {(data?.salesByMethod ?? []).map((method) => (
            <Row
              key={method.paymentMethodId}
              label={`${method.paymentMethodName}${method.countedInDrawer ? '' : ' (not in drawer)'} · ${method.txnCount}`}
              value={money(method.amount)}
              muted={!method.countedInDrawer}
            />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Cash drawer" description="Count the drawer and enter the figure." />
        <CardBody>
          <Row label="Opening cash" value={money(data?.openingCash ?? 0)} muted />
          <Row label="Expected in drawer" value={money(expected)} strong />

          <Field label="Physical cash counted">
            <Input
              value={physicalCash}
              onChangeText={setPhysicalCash}
              keyboardType="decimal-pad"
              placeholder={String(expected)}
              icon="cash-outline"
              size="lg"
              selectTextOnFocus
              editable={!existing && canPerform}
            />
          </Field>

          {hasCount ? (
            <Row
              label={variance === 0 ? 'Balanced' : variance > 0 ? 'Excess' : 'Short'}
              value={money(Math.abs(variance))}
              tone={Math.abs(variance) <= 1 ? 'success' : 'danger'}
              strong
            />
          ) : null}

          {hasCount && Math.abs(variance) > 1 ? (
            <Text style={[styles.warn, { color: colors.warning }]}>
              A variance beyond ₹1 raises a cash Discrepancy on submit, which then has to be
              investigated, resolved or written off.
            </Text>
          ) : null}

          {!existing ? (
            <Field label="Note" hint="Optional — why the drawer is off, who counted it.">
              <Input value={note} onChangeText={setNote} placeholder="Add a note" multiline />
            </Field>
          ) : null}
        </CardBody>
      </Card>

      {submit.error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>
          {(submit.error as Error).message}
        </Text>
      ) : null}
      {approve.error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>
          {(approve.error as Error).message}
        </Text>
      ) : null}

      {!existing ? (
        canPerform ? (
          <Button
            label="Submit day-end closing"
            icon="lock-closed-outline"
            size="lg"
            block
            disabled={!hasCount || submit.isPending}
            loading={submit.isPending}
            onPress={onSubmit}
          />
        ) : (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            You can see the day's figures but not submit the closing — that needs the
            “closing.perform” permission.
          </Text>
        )
      ) : existing.status === 'submitted' ? (
        canApprove ? (
          <Button
            label="Approve and lock the day"
            icon="checkmark-done"
            variant="success"
            size="lg"
            block
            loading={approve.isPending}
            disabled={approve.isPending || !user}
            onPress={() =>
              user && approve.mutate({ closingId: existing.id, approvedBy: user.id })
            }
          />
        ) : (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Submitted and waiting on someone with approval rights to lock the day.
          </Text>
        )
      ) : (
        <Badge label={`Day ${statusLabel(existing.status).toLowerCase()}`} tone={statusTone(existing.status)} />
      )}

      <Card>
        <CardHeader
          title="Open discrepancies"
          description="Raised automatically by closing and short receipts."
          action={<Badge label={String(openDiscrepancies.length)} tone={openDiscrepancies.length ? 'danger' : 'neutral'} />}
        />
        {openDiscrepancies.length === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="Nothing outstanding"
            hint="Cash and stock both reconcile right now."
          />
        ) : (
          <CardBody>
            {openDiscrepancies.map((d) => (
              <Row
                key={d.id}
                label={`${d.kind} · ${d.businessDate}`}
                value={money(d.variance)}
                tone={d.variance < 0 ? 'danger' : 'default'}
              />
            ))}
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Resolving and writing off happens on the web app's Reconciliation screen.
            </Text>
          </CardBody>
        )}
      </Card>
    </ScrollScreen>
  );
}

const statusLabel = (status: string) =>
  status === 'submitted'
    ? 'Submitted'
    : status === 'approved'
      ? 'Approved'
      : status === 'rejected'
        ? 'Rejected'
        : 'Open';

const statusTone = (status: string): Tone =>
  status === 'approved'
    ? 'success'
    : status === 'submitted'
      ? 'warning'
      : status === 'rejected'
        ? 'danger'
        : 'neutral';

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  warn: { fontSize: fontSize.xs, lineHeight: 16 },
  hint: { fontSize: fontSize.xs, lineHeight: 16, marginTop: spacing.xs },
  error: { fontSize: fontSize.sm },
});
