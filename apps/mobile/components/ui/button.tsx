import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { fontSize, radius, spacing, touch, useTheme, type ColorScale } from '@/lib/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const HEIGHT: Record<Size, number> = { sm: touch.sm, md: touch.min, lg: touch.lg };
const TEXT: Record<Size, number> = { sm: fontSize.sm, md: fontSize.base, lg: fontSize.lg };
const ICON: Record<Size, number> = { sm: 15, md: 18, lg: 20 };

function palette(variant: Variant, colors: ColorScale) {
  switch (variant) {
    case 'primary':
      return { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary };
    case 'danger':
      return { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive };
    case 'success':
      return { bg: colors.success, fg: colors.successForeground, border: colors.success };
    case 'outline':
      return { bg: 'transparent', fg: colors.foreground, border: colors.border };
    case 'ghost':
      return { bg: 'transparent', fg: colors.primary, border: 'transparent' };
  }
}

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  /** Right-aligned trailing text — the amount on a Bill button, a count, etc. */
  trailing?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Stretches to the container width. Primary actions should nearly always. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  trailing,
  disabled,
  loading,
  block,
  style,
}: ButtonProps) {
  const colors = useTheme();
  const tone = palette(variant, colors);
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inert), busy: Boolean(loading) }}
      accessibilityLabel={trailing ? `${label} ${trailing}` : label}
      disabled={inert}
      onPress={onPress}
      android_ripple={variant === 'ghost' ? undefined : { color: '#00000022' }}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          backgroundColor: tone.bg,
          borderColor: tone.border,
          opacity: inert ? 0.45 : pressed ? 0.82 : 1,
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={ICON[size]} color={tone.fg} />
      ) : null}

      <Text style={[styles.label, { color: tone.fg, fontSize: TEXT[size] }]} numberOfLines={1}>
        {label}
      </Text>

      {trailing ? (
        <>
          <View style={styles.spacer} />
          <Text style={[styles.trailing, { color: tone.fg, fontSize: TEXT[size] }]}>{trailing}</Text>
        </>
      ) : null}
    </Pressable>
  );
}

/** Square icon-only button — used for close, overflow and stepper affordances. */
export function IconButton({
  icon,
  onPress,
  label,
  variant = 'outline',
  size = touch.min,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  /** Screen-reader name. Icon-only controls are unusable without it. */
  label: string;
  variant?: Variant;
  size?: number;
  disabled?: boolean;
}) {
  const colors = useTheme();
  const tone = palette(variant, colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.icon,
        {
          width: size,
          height: size,
          backgroundColor: tone.bg,
          borderColor: tone.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.44)} color={tone.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  label: { fontWeight: '600' },
  spacer: { flex: 1 },
  trailing: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
