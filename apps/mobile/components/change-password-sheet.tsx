import { useChangePassword } from '@shop/state';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Field, Input, Sheet } from '@/components/ui';
import { fontSize, spacing, useTheme } from '@/lib/theme';

/** Mirrors PASSWORD_MIN in the API, which rejects anything shorter. */
const MIN = 8;

/**
 * Changing your own password, from the phone.
 *
 * `forced` is the case that matters at a counter: an administrator handed over
 * a temporary password, and nothing else in the app opens until it is replaced.
 * The sheet then has no dismiss — tapping the scrim does nothing, because there
 * is nowhere to dismiss to.
 */
export function ChangePasswordSheet({
  visible,
  forced = false,
  onClose,
}: {
  visible: boolean;
  forced?: boolean;
  onClose: () => void;
}) {
  const colors = useTheme();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();

  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsOld = next.length > 0 && next === current;
  const ready = Boolean(current) && next.length >= MIN && next === confirm && !sameAsOld;

  const submit = async () => {
    setError(undefined);
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the password');
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={forced ? () => {} : onClose}
      title={forced ? 'Choose a password' : 'Change password'}
      description={
        forced
          ? 'Your password was set by an administrator, so it is temporary. Choose your own to carry on.'
          : 'You stay signed in on this phone. Every other device is signed out.'
      }
      footer={
        <Button
          label={change.isPending ? 'Saving…' : 'Change password'}
          size="lg"
          block
          disabled={!ready || change.isPending}
          onPress={() => void submit()}
        />
      }
    >
      <View style={styles.body}>
        <Field label="Current password">
          <Input
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
          />
        </Field>

        <Field label="New password" hint={`At least ${MIN} characters.`}>
          <Input
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </Field>

        <Field label="Confirm new password">
          <Input
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </Field>

        {mismatch ? (
          <Text style={[styles.note, { color: colors.destructive }]}>The two do not match.</Text>
        ) : null}
        {sameAsOld ? (
          <Text style={[styles.note, { color: colors.destructive }]}>
            That is the password you already have.
          </Text>
        ) : null}
        {error ? (
          <Text style={[styles.note, { color: colors.destructive }]}>{error}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  note: { fontSize: fontSize.sm },
});
