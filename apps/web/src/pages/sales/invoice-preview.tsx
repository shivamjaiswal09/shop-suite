import { invoiceHtml, type InvoicePage } from '@shop/core';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

/**
 * The bill as it will print, before anything is written.
 *
 * Rendered from the same template the PDF is printed from, so what is approved
 * here and what comes out of the printer cannot describe different sales. It is
 * drawn in an iframe rather than inlined: the template carries its own
 * stylesheet, written for a sheet of paper, and letting that loose in the app's
 * document would restyle the page around it.
 */
export function InvoicePreview({
  page,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  page: InvoicePage;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open
      title="Raise this invoice?"
      description="This is the bill as it will print. Nothing is recorded until you confirm."
      onClose={onCancel}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {error ? <span className="text-sm text-destructive">{error}</span> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              Back to cart
            </Button>
            <Button onClick={onConfirm} disabled={pending}>
              {pending ? 'Raising…' : 'Confirm & raise'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="rounded-md border border-border bg-white">
        <iframe
          title="Invoice preview"
          className="h-[60vh] w-full"
          // No scripts: the template is ours, but it is about to become
          // user-authored, and a sandbox is far harder to retrofit than to
          // include from the start — the same reason the renderer disables JS.
          sandbox=""
          srcDoc={invoiceHtml(page, null, ['original'])}
        />
      </div>
    </Modal>
  );
}
