import { Ionicons } from '@expo/vector-icons';
import type { StockLocation } from '@shop/core';
import { useAccessibleStores, useCartStore, useSessionStore } from '@shop/state';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Sheet } from '@/components/ui';
import { fontSize, radius, spacing, touch, useTheme } from '@/lib/theme';

/**
 * The one piece of context the header carries: the store being sold from.
 * Billing, invoices and day-end all key to it, so it has to be changeable
 * without digging through a settings screen — but it is also the single
 * setting most likely to be changed by accident, hence the sheet rather than
 * a cycling tap.
 *
 * Inventory screens deliberately do NOT read this — each picks its own
 * location, so there is never a second stock scope to disagree with. Same rule
 * as the web `StoreSwitcher`.
 */
export function StoreSwitcher() {
  const colors = useTheme();
  const store = useSessionStore((s) => s.store);
  const setStore = useSessionStore((s) => s.setStore);
  const stores = useAccessibleStores();

  const cartLines = useCartStore((s) => s.lines);
  const clearCart = useCartStore((s) => s.clear);

  const [open, setOpen] = useState(false);
  // A store change with a bill in progress is destructive, so it takes a second
  // tap. Holding the choice here keeps the sheet open to explain why.
  const [pending, setPending] = useState<StockLocation | null>(null);

  const list = stores.data ?? [];
  const label = store?.name ?? 'No store';

  const close = () => {
    setOpen(false);
    setPending(null);
  };

  const commit = (next: StockLocation) => {
    clearCart();
    setStore(next);
    close();
  };

  const choose = (next: StockLocation) => {
    if (next.id === store?.id) return close();
    // The cart is priced and stock-checked against the current store; carrying
    // it across would bill one store's shelf from another's counter.
    if (cartLines.length > 0) return setPending(next);
    commit(next);
  };

  // Nothing to switch between — show the context without implying a control.
  if (list.length <= 1) {
    return (
      <View style={styles.pill} accessible accessibilityLabel={`Selling from ${label}`}>
        <Ionicons name="storefront-outline" size={14} color={colors.mutedForeground} />
        <Text style={[styles.pillText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Selling from ${label}. Change store`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.pill,
          styles.pillButton,
          { backgroundColor: colors.muted, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="storefront-outline" size={14} color={colors.mutedForeground} />
        <Text style={[styles.pillText, { color: colors.foreground }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={13} color={colors.mutedForeground} />
      </Pressable>

      <Sheet
        visible={open}
        onClose={close}
        title="Selling store"
        description="Billing, invoices and day-end all key to this store. Stock screens keep their own location."
        footer={
          pending ? (
            <Button
              label={`Discard bill and switch to ${pending.name}`}
              icon="warning-outline"
              variant="danger"
              size="lg"
              block
              onPress={() => commit(pending)}
            />
          ) : undefined
        }
      >
        <View style={styles.list}>
          {pending ? (
            <View style={[styles.warning, { backgroundColor: colors.muted, borderColor: colors.warning }]}>
              <Ionicons name="alert-circle" size={18} color={colors.warning} />
              <Text style={[styles.warningText, { color: colors.foreground }]}>
                {cartLines.length} {cartLines.length === 1 ? 'item' : 'items'} on the running bill
                were priced for {store?.name}. Switching clears them.
              </Text>
            </View>
          ) : null}

          {list.map((s) => {
            const active = s.id === store?.id;
            const staged = s.id === pending?.id;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => choose(s)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderColor: staged ? colors.warning : active ? colors.primary : colors.border,
                    backgroundColor: active || staged ? colors.accent : 'transparent',
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={active ? colors.primary : colors.mutedForeground}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{s.name}</Text>
                  {s.code ? (
                    <Text style={[styles.code, { color: colors.mutedForeground }]}>{s.code}</Text>
                  ) : null}
                </View>
                {active ? <Badge label="Selling" tone="info" /> : null}
                {staged ? <Badge label="Confirm below" tone="warning" /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 190,
    marginRight: spacing.lg,
  },
  pillButton: {
    minHeight: touch.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  pillText: { flexShrink: 1, fontSize: fontSize.sm, fontWeight: '600' },
  list: { gap: spacing.sm },
  row: {
    minHeight: touch.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.base, fontWeight: '600' },
  code: { fontSize: fontSize.xs },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  warningText: { flex: 1, fontSize: fontSize.sm, lineHeight: 19 },
});
