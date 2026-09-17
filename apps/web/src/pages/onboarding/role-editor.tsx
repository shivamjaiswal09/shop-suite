import {
  isNodeVisible,
  NAV_TREE,
  normalizeRolePermissions,
  setActionGranted,
  setScreenGranted,
  type ActionPermission,
  type NavNode,
  type Permission,
  type Role,
} from '@shop/core';
import { Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

/**
 * The permission tree.
 *
 * It renders `NAV_TREE` rather than a list of permission strings, because the
 * question an admin is actually answering is "what does this person see when
 * they sign in", and a checklist of keys like `view.inventory.warehouses` is
 * not that question. What they tick here is laid out exactly as the sidebar
 * they are configuring.
 *
 * Every tick goes through the shared helpers in `@shop/core` rather than
 * editing the array directly, so the implications — an action grants the screen
 * it is performed on, dropping a screen drops its actions — are applied here,
 * in the API, and in the mock by the same code.
 */

const labelFor: Record<ActionPermission, string> = {
  'sales.bill': 'Bill a sale',
  'sales.override_price': 'Override price',
  'sales.refund': 'Refund',
  'inventory.view': 'View stock',
  'inventory.adjust': 'Adjust stock',
  'purchase.manage': 'Manage purchases',
  'closing.perform': 'Submit closing',
  'closing.approve': 'Approve closing',
  'admin.manage': 'Administer company',
};

const MOBILE_TAB_LABEL: Record<string, string> = {
  home: 'Home tab',
  bill: 'Bill tab',
  stock: 'Stock tab',
  closing: 'Closing tab',
};

function Checkbox({
  checked,
  indeterminate,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      // Indeterminate is not an attribute, only a property — a partly-ticked
      // group has to be set through the node itself.
      ref={(node) => {
        if (node) node.indeterminate = Boolean(indeterminate && !checked);
      }}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function NodeRow({
  node,
  granted,
  disabled,
  onChange,
  depth = 0,
}: {
  node: NavNode;
  granted: Permission[];
  disabled: boolean;
  onChange: (next: Permission[]) => void;
  depth?: number;
}) {
  const set = useMemo(() => new Set<string>(granted), [granted]);
  const isGroup = Boolean(node.children?.length);
  const checked = isGroup ? isNodeVisible(node, set) : Boolean(node.screen && set.has(node.screen));

  // A group is partly ticked when some but not all of its children are, which
  // is the state that tells an admin at a glance that there is more inside.
  const partly =
    isGroup && node.children!.some((c) => isNodeVisible(c, set)) &&
    !node.children!.every((c) => isNodeVisible(c, set));

  const toggleGroup = (next: boolean) => {
    let result = granted;
    for (const child of node.children ?? []) {
      if (child.screen) result = setScreenGranted(result, child.screen, next);
    }
    onChange(result);
  };

  return (
    <div>
      <div
        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        <Checkbox
          checked={checked}
          indeterminate={partly}
          disabled={disabled}
          label={node.label}
          onChange={(next) =>
            isGroup
              ? toggleGroup(next)
              : node.screen && onChange(setScreenGranted(granted, node.screen, next))
          }
        />
        <span className={isGroup ? 'text-sm font-medium' : 'text-sm'}>{node.label}</span>

        {node.mobileTab ? (
          <span
            className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            title={`Also shows the ${MOBILE_TAB_LABEL[node.mobileTab]} on the phone app`}
          >
            <Smartphone className="h-3 w-3" />
            {MOBILE_TAB_LABEL[node.mobileTab]}
          </span>
        ) : null}
      </div>

      {/* Actions sit under the screen they are performed on, and are only
          reachable once that screen is granted — which is also the rule the
          normaliser enforces, so the UI is not making a separate promise. */}
      {node.actions?.length && checked ? (
        <div className="space-y-0.5" style={{ paddingLeft: `${(depth + 1) * 18 + 8}px` }}>
          {node.actions.map((action) => (
            <label
              key={action}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:bg-muted/60"
            >
              <Checkbox
                checked={set.has(action)}
                disabled={disabled}
                label={labelFor[action]}
                onChange={(next) => onChange(setActionGranted(granted, action, next))}
              />
              {labelFor[action]}
            </label>
          ))}
        </div>
      ) : null}

      {node.children?.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          granted={granted}
          disabled={disabled}
          onChange={onChange}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export interface RoleDraft {
  id?: string;
  name: string;
  permissions: Permission[];
  system: boolean;
}

export function roleDraft(role?: Role): RoleDraft {
  if (!role) return { name: '', permissions: [], system: false };
  return {
    name: role.name,
    id: role.id,
    permissions: normalizeRolePermissions(role.permissions),
    system: role.system,
  };
}

/** A copy of an existing role, ready to be saved as a new one. */
export function duplicateOf(role: Role): RoleDraft {
  return {
    name: `${role.name} (copy)`,
    permissions: normalizeRolePermissions(role.permissions),
    system: false,
  };
}

export function RoleEditor({
  draft,
  pending,
  error,
  onClose,
  onSave,
}: {
  draft: RoleDraft | null;
  pending?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (draft: RoleDraft) => Promise<void>;
}) {
  const [name, setName] = useState(draft?.name ?? '');
  const [permissions, setPermissions] = useState<Permission[]>(draft?.permissions ?? []);

  if (!draft) return null;

  const readOnly = draft.system;
  const screenCount = permissions.filter((p) => p.startsWith('view.')).length;

  return (
    <Modal
      open
      title={draft.id ? `Edit ${draft.name}` : 'New role'}
      description={
        readOnly
          ? 'Built-in roles cannot be edited. Duplicate this one to make a version you can change.'
          : 'Tick what this role sees when it signs in. The tree is the sidebar; actions sit under the screen they happen on.'
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="role-name">
            Role name
          </label>
          <input
            id="role-name"
            value={name}
            disabled={readOnly}
            placeholder="Floor Manager"
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium">What this role can see and do</p>
            <p className="text-xs text-muted-foreground">
              {screenCount} screen{screenCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="max-h-[45vh] space-y-0.5 overflow-y-auto p-2">
            {NAV_TREE.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                granted={permissions}
                disabled={readOnly || pending === true}
                onChange={setPermissions}
              />
            ))}
          </div>
        </div>

        {screenCount === 0 && !readOnly ? (
          <p className="text-xs text-muted-foreground">
            A role with nothing ticked can sign in but has no screen to land on. Tick at least one.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={readOnly || pending || !name.trim() || screenCount === 0}
            onClick={() => void onSave({ ...draft, name: name.trim(), permissions })}
          >
            {pending ? 'Saving…' : draft.id ? 'Save changes' : 'Create role'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
