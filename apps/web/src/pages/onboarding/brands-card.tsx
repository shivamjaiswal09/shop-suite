import { subBrandsOf, topLevelBrands, type Brand } from '@shop/core';
import {
  useBrands,
  useCreateBrand,
  useDeleteBrand,
  useSessionStore,
  useUpdateBrand,
} from '@shop/state';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';

/**
 * Brands, and the sub-brands under each.
 *
 * Rendered as a list of brands with their children indented rather than a flat
 * table, because the relationship is the whole point — a sub-brand's name means
 * nothing without the brand above it, and two brands may each have a "Zoom".
 */
export function BrandsCard() {
  const user = useSessionStore((s) => s.user);
  const brands = useBrands(true);
  const create = useCreateBrand();
  const update = useUpdateBrand();
  const remove = useDeleteBrand();

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = brands.data ?? [];
  const parents = topLevelBrands(all);

  const add = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), parentId: parentId || undefined });
      setName('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const toggle = (brand: Brand) => {
    if (!user) return;
    setError(null);
    update.mutate({ id: brand.id, patch: { active: !brand.active }, actorId: user.id });
  };

  const del = async (brand: Brand) => {
    setError(null);
    try {
      await remove.mutateAsync(brand.id);
    } catch (cause) {
      // Shown rather than swallowed: the refusal names what is still using the
      // brand, which is the only way to know what to do about it.
      setError((cause as Error).message);
    }
  };

  const actions = (brand: Brand) => (
    <div className="flex shrink-0 gap-1">
      <Button size="sm" variant="ghost" onClick={() => toggle(brand)}>
        {brand.active ? 'Deactivate' : 'Reactivate'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={remove.isPending}
        onClick={() => void del(brand)}
      >
        Delete
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Brands"
        description="Brands and the sub-brands under them. A product picks a brand, then one of its sub-brands."
      />

      <CardBody className="space-y-3 border-b border-border">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="b-name">Name</Label>
            <Input
              id="b-name"
              placeholder="Ceat"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="b-parent">Under</Label>
            <Select id="b-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— a brand in its own right —</option>
              {parents.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button disabled={create.isPending || !name.trim()} onClick={() => void add()}>
              {create.isPending ? 'Adding…' : parentId ? 'Add sub-brand' : 'Add brand'}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
      </CardBody>

      <CardBody className="space-y-4">
        {parents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No brands yet. Add one above, then add its sub-brands under it.
          </p>
        ) : (
          parents.map((brand) => {
            const children = subBrandsOf(all, brand.id);
            return (
              <div key={brand.id} className={brand.active ? undefined : 'opacity-50'}>
                <div className="flex items-center justify-between gap-3 border-b border-border pb-1.5">
                  <span className="font-medium">{brand.name}</span>
                  {actions(brand)}
                </div>
                {children.length === 0 ? (
                  <p className="mt-1.5 pl-4 text-xs text-muted-foreground">No sub-brands.</p>
                ) : (
                  <div className="mt-1.5 space-y-1 border-l border-border pl-4">
                    {children.map((sub) => (
                      <div
                        key={sub.id}
                        className={`flex items-center justify-between gap-3 text-sm ${sub.active ? '' : 'opacity-50'}`}
                      >
                        <span>{sub.name}</span>
                        {actions(sub)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}
