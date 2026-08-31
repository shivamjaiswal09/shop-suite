import { Modal } from '@/components/ui/modal';
import { RecordForm, type FormField, type FormValues } from './record-form';

export interface EditTarget {
  id: string;
  title: string;
  fields: FormField[];
}

/**
 * Edit reuses the exact field spec the create form uses, so a field can never
 * be creatable but not editable. Remounted per record via `key`, which is what
 * makes `RecordForm`'s initial values pick up the row you clicked.
 */
export function EditDialog({
  target,
  submitLabel = 'Save changes',
  pending,
  onClose,
  onSubmit,
}: {
  target: EditTarget | null;
  submitLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (id: string, values: FormValues) => Promise<void>;
}) {
  if (!target) return null;

  return (
    <Modal open title={target.title} onClose={onClose}>
      <RecordForm
        key={target.id}
        fields={target.fields}
        submitLabel={submitLabel}
        pending={pending}
        resetOnSuccess={false}
        onSubmit={async (values) => {
          await onSubmit(target.id, values);
          onClose();
        }}
      />
    </Modal>
  );
}

/** Shared active/inactive field — nothing is deleted, only deactivated. */
export const activeField = (active: boolean): FormField => ({
  name: 'active',
  label: 'Active',
  type: 'checkbox',
  initial: String(active),
});
