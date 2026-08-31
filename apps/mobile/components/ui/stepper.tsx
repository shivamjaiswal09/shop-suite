import { StyleSheet, Text, View } from 'react-native';
import { IconButton } from './button';
import { fontSize, radius, spacing, touch, useTheme } from '@/lib/theme';

/**
 * Quantity stepper. Deliberately buttons rather than a text field: at a counter
 * the quantity is almost always 1–3, and summoning a keyboard to type it is
 * slower and covers the cart. Long-press the field to type an exact figure.
 */
export function Stepper({
  value,
  onChange,
  onPressValue,
  min = 0,
  max,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Opens whatever exact-entry affordance the screen provides. */
  onPressValue?: () => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const colors = useTheme();
  const atMax = max !== undefined && value >= max;

  return (
    <View style={styles.wrap}>
      <IconButton
        icon="remove"
        label="Decrease quantity"
        size={touch.sm}
        disabled={disabled || value <= min}
        onPress={() => onChange(value - 1)}
      />
      <Text
        accessibilityRole="text"
        accessibilityLabel={`Quantity ${value}`}
        onPress={onPressValue}
        style={[styles.value, { color: colors.foreground, backgroundColor: colors.muted }]}
      >
        {value}
      </Text>
      <IconButton
        icon="add"
        label="Increase quantity"
        size={touch.sm}
        disabled={disabled || atMax}
        onPress={() => onChange(value + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  value: {
    minWidth: 46,
    height: touch.sm,
    lineHeight: touch.sm,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: fontSize.base,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    overflow: 'hidden',
  },
});
