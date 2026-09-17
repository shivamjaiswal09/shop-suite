import { useChangePassword } from '@shop/state';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

/** Mirrors PASSWORD_MIN in the API, which rejects anything shorter. */
const MIN = 8;

/**
 * Changing your own password.
 *
 * The current password is required and is not a formality: an unlocked laptop
 * is not authorisation to change the credential on it. The server checks it
 * again regardless — this field exists so the person is told what is wrong
 * before a round trip, not because the client is trusted.
 *
 * `forced` renders it as a gate rather than a dialog: no close button, no
 * backdrop dismiss, because the only way past it is to choose a password.
 */
export function ChangePasswordDialog({
  open,
  forced = false,
  onClose,
}: {
  open: boolean;
  forced?: boolean;
  onClose: () => void;
}) {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();

  if (!open) return null;

  // Checked here only to say so early; the API is the authority on all three.
  const tooShort = next.length > 0 && next.length < MIN;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsOld = next.length > 0 && next === current;
  const ready = current && next.length >= MIN && next === confirm && !sameAsOld;

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
    <Modal
      open
      title={forced ? 'Choose a password' : 'Change password'}
      description={
        forced
          ? 'Your password was set by an administrator, so it is temporary. Choose your own to continue.'
          : 'You will stay signed in here. Every other device is signed out.'
      }
      // A forced change has nowhere to go but through it.
      onClose={forced ? () => {} : onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="current-password">
            Current password
          </label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="new-password">
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">At least {MIN} characters.</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="confirm-password">
            Confirm new password
          </label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready) void submit();
            }}
          />
        </div>

        {tooShort ? (
          <p className="text-xs text-muted-foreground">
            That is {next.length} character{next.length === 1 ? '' : 's'}; {MIN} is the minimum.
          </p>
        ) : null}
        {mismatch ? <p className="text-xs text-destructive">The two do not match.</p> : null}
        {sameAsOld ? (
          <p className="text-xs text-destructive">
            That is the password you already have. Choose a different one.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          {forced ? null : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button disabled={!ready || change.isPending} onClick={() => void submit()}>
            {change.isPending ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
