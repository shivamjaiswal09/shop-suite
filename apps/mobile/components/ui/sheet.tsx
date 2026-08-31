import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './button';
import { elevation, fontSize, radius, spacing, useTheme } from '@/lib/theme';

/**
 * Bottom sheet. Actions live at the bottom of the screen because that is where
 * a thumb is — a centred dialog would put the confirm button out of reach on a
 * large phone. Tapping the scrim or the close button dismisses.
 */
export function Sheet({
  visible,
  onClose,
  title,
  description,
  children,
  /** Pinned above the safe area — put the primary action here, not in `children`. */
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  // No `statusBarTranslucent` on the Modal on purpose: with it set, Android
  // stops resizing the modal window when the keyboard opens and any field low
  // in the sheet ends up underneath it. Paired with `softwareKeyboardLayoutMode:
  // "pan"` in app.json, the focused input is always brought above the keyboard.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={[
              styles.sheet,
              elevation.raised,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
                {description ? (
                  <Text style={[styles.description, { color: colors.mutedForeground }]}>
                    {description}
                  </Text>
                ) : null}
              </View>
              <IconButton icon="close" label="Close" variant="ghost" onPress={onClose} size={36} />
            </View>

            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? (
              <View
                style={[
                  styles.footer,
                  { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.lg) },
                ]}
              >
                {footer}
              </View>
            ) : (
              <View style={{ height: Math.max(insets.bottom, spacing.lg) }} />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b122099' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '90%',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.lg, fontWeight: '700' },
  description: { fontSize: fontSize.xs, lineHeight: 16 },
  bodyScroll: { flexGrow: 0 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  footer: {
    gap: spacing.sm,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
