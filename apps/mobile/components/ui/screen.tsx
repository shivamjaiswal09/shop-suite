import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontSize, spacing, useTheme } from '@/lib/theme';

/**
 * Screen background + horizontal gutter. The tab bar already owns the bottom
 * inset, so screens inside the tab group only need the top handled by the
 * navigator header.
 */
export function Screen({
  children,
  style,
  gutter = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gutter?: boolean;
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background },
        gutter && { paddingHorizontal: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Scrolling variant, with the bottom inset added so content clears the tab bar. */
export function ScrollScreen({
  children,
  gutter = true,
  refreshControl,
}: {
  children: ReactNode;
  gutter?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.scrollContent,
        gutter && { paddingHorizontal: spacing.lg },
        { paddingBottom: insets.bottom + spacing['3xl'] },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      // Keeps a focused field clear of the keyboard on iOS; on Android the
      // `pan` layout mode in app.json does the same job.
      automaticallyAdjustKeyboardInsets
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingTop: spacing.lg, gap: spacing.lg },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
