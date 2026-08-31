import { basisOfTax, type PriceBasis } from '@shop/core';
import { useCartStore, useTaxMap, type CartLine } from '@shop/state';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Input, Row, Sheet } from '@/components/ui';
import { fontSize, money, radius, spacing, touch, useTheme } from '@/lib/theme';

/**
 * Line options — exact quantity, a line discount, and a manual price typed on
 * either side of tax. The basis toggle is the whole point: a shopkeeper quotes
 * the customer an all-in figure, so being able to type ₹100 *inclusive* and
 * have the taxable value fall out beats reaching for a calculator.
 */
export function LineSheet({ line, onClose }: { line: CartLine | null; onClose: () => void }) {
  const colors = useTheme();
  const taxes = useTaxMap();
  const cart = useCartStore();

  const [qtyText, setQtyText] = useState('1');
  const [discountText, setDiscountText] = useState('0');
  const [priceText, setPriceText] = useState('');
  const [basis, setBasis] = useState<PriceBasis>('exclusive');

  const tax = line ? taxes.get(line.sku.taxId) : undefined;
  const nativeBasis = tax ? basisOfTax(tax) : 'exclusive';

  // Re-seed the fields whenever a different line is opened.
  useEffect(() => {
    if (!line) return;
    setQtyText(String(line.qty));
    setDiscountText(String(line.discount || 0));
    setPriceText(line.unitPriceOverride !== undefined ? String(line.unitPriceOverride) : '');
    setBasis(line.overrideBasis ?? (tax ? basisOfTax(tax) : 'exclusive'));
  }, [line, tax]);

  if (!line) return null;

  const apply = () => {
    const nextQty = Number(qtyText);
    cart.setQty(line.lineId, Number.isFinite(nextQty) && nextQty > 0 ? nextQty : 0);

    const nextDiscount = Number(discountText);
    cart.setDiscount(line.lineId, Number.isFinite(nextDiscount) ? nextDiscount : 0);

    const trimmed = priceText.trim();
    if (trimmed === '') {
      cart.clearUnitPrice(line.lineId);
    } else {
      const nextPrice = Number(trimmed);
      if (Number.isFinite(nextPrice) && nextPrice >= 0) {
        cart.setUnitPrice(line.lineId, nextPrice, basis);
      }
    }
    onClose();
  };

  const removeLine = () => {
    cart.remove(line.lineId);
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={line.sku.name}
      description={`${line.sku.code} · list price ${money(line.sku.sellingPrice)}`}
      footer={
        <>
          <Button label="Save changes" icon="checkmark" block size="lg" onPress={apply} />
          <Button label="Remove from bill" icon="trash-outline" variant="ghost" block onPress={removeLine} />
        </>
      }
    >
      <View style={styles.body}>
        <Field label="Quantity">
          <Input
            value={qtyText}
            onChangeText={setQtyText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            size="lg"
          />
        </Field>

        <Field label="Line discount" hint="An absolute rupee amount off this line.">
          <Input
            value={discountText}
            onChangeText={setDiscountText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            trailing={<Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>₹</Text>}
          />
        </Field>

        <Field
          label="Manual unit price"
          hint={`Leave blank to use the SKU price. This SKU's tax is quoted ${nativeBasis} of tax.`}
        >
          <Input
            value={priceText}
            onChangeText={setPriceText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder={String(line.sku.sellingPrice)}
          />
          <View style={styles.segmented}>
            {(['exclusive', 'inclusive'] as const).map((option) => {
              const active = basis === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setBasis(option)}
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
                    {option === 'exclusive' ? 'Before tax' : 'All-in price'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {tax ? <Row label="Tax rate" value={`${tax.rate}%`} muted /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  segmented: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  segment: {
    flex: 1,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
