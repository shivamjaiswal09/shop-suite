import { Ionicons } from '@expo/vector-icons';
import { forwardRef, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { IconName } from './button';
import { fontSize, radius, spacing, touch, useTheme } from '@/lib/theme';

export interface InputProps extends TextInputProps {
  icon?: IconName;
  /** Rendered inside the field on the right — a clear button, a unit, a chip. */
  trailing?: ReactNode;
  size?: 'md' | 'lg';
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { icon, trailing, size = 'md', style, containerStyle, ...props },
  ref,
) {
  const colors = useTheme();
  const height = size === 'lg' ? touch.lg : touch.min;

  return (
    <View
      style={[
        styles.wrap,
        { height, backgroundColor: colors.card, borderColor: colors.border },
        containerStyle,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.mutedForeground} /> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          { color: colors.foreground, fontSize: size === 'lg' ? fontSize.lg : fontSize.base },
          style,
        ]}
        {...props}
      />
      {trailing}
    </View>
  );
});

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const colors = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  input: { flex: 1, padding: 0 },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: fontSize.xs, lineHeight: 15 },
});
