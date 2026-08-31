import {
  useAuditLog,
  useClosingPreview,
  useInvoices,
  useSessionStore,
  useStockOverview,
} from '@shop/state';
import { AlertTriangle, IndianRupee, PackageX, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { money, qty as fmtQty, shortDateTime, shortTime, todayIso } from '@/lib/utils';

export function HomePage() {
  const store = useSessionStore((s) => s.store);
  const counterId = useSessionStore((s) => s.counterId);
  const [date, setDate] = useState(todayIso());
  const isToday = date === todayIso();

  const invoices = useInvoices({ storeId: store?.id, businessDate: date });
  const stock = useStockOverview(store?.id);
  const closing = useClosingPreview(
    store ? { storeId: store.id, counterId, businessDate: date } : undefined,
  );
  const audit = useAuditLog(8);

  const todaySales = (invoices.data ?? []).reduce((sum, i) => sum + i.totals.grandTotal, 0);
  const alerts = stock.rows
    .filter((row) => row.alert !== 'ok')
    .sort((a, b) => a.level.available - b.level.available)
    .slice(0, 8);

  const chartData = (closing.data?.salesByMethod ?? []).map((row) => ({
    name: row.paymentMethodName,
    amount: row.amount,
  }));

  return (
    <>
      <PageHeader
        title={`Good day at ${store?.name ?? ''}`}
        description={`Business dashboard · shelf stock at ${store?.name ?? ''}`}
        actions={
          <div>
            <Label htmlFor="home-date">Business date</Label>
            <Input id="home-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={isToday ? 'Sales today' : `Sales on ${date}`}
          value={money(todaySales)}
          hint={`${invoices.data?.length ?? 0} invoices`}
          icon={IndianRupee}
        />
        <Stat label="Stock value" value={money(stock.summary.stockValue)} hint={`${stock.summary.skuCount} SKUs`} icon={Receipt} />
        <Stat
          label="Low stock"
          value={String(stock.summary.lowStock)}
          hint="At or below reorder level"
          icon={AlertTriangle}
          tone={stock.summary.lowStock ? 'warning' : 'default'}
        />
        <Stat
          label="Out of stock"
          value={String(stock.summary.outOfStock)}
          hint="Blocked from billing"
          icon={PackageX}
          tone={stock.summary.outOfStock ? 'danger' : 'default'}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Sales by payment method" description={`Counter ${counterId} · ${date}`} />
          <CardBody>
            {chartData.every((d) => d.amount === 0) ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No payments captured on {date}.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} width={70} />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)' }}
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => money(value)}
                    />
                    <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Pending actions & alerts"
            description="Reorder these before they run out."
            action={
              <Link to="/inventory/stores" className="text-xs text-primary underline">
                Stock overview
              </Link>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th className="text-right">Available</Th>
                <Th className="text-right">Min</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <EmptyRow colSpan={4}>Everything is above its reorder level.</EmptyRow>
              ) : (
                alerts.map((row) => (
                  <tr key={row.sku.id}>
                    <Td>
                      <p className="font-medium">{row.sku.name}</p>
                      <p className="text-xs text-muted-foreground">{row.sku.code}</p>
                    </Td>
                    <Td className="tabular text-right font-semibold">{fmtQty(row.level.available)}</Td>
                    <Td className="tabular text-right text-muted-foreground">{fmtQty(row.sku.minStock)}</Td>
                    <Td className="text-right">
                      <Badge tone={row.alert === 'out_of_stock' ? 'danger' : 'warning'}>
                        {row.alert.replace('_', ' ')}
                      </Badge>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Recent invoices"
            action={
              <Link to="/sales/invoices" className="text-xs text-primary underline">
                View all
              </Link>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Time</Th>
                <Th>Customer</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {(invoices.data ?? []).length === 0 ? (
                <EmptyRow colSpan={4}>Nothing billed on {date}.</EmptyRow>
              ) : (
                invoices.data!.slice(0, 6).map((invoice) => (
                  <tr key={invoice.id}>
                    <Td className="font-medium">{invoice.number}</Td>
                    <Td className="text-muted-foreground">{shortTime(invoice.createdAt)}</Td>
                    <Td>{invoice.customerName ?? 'Walk-in Customer'}</Td>
                    <Td className="tabular text-right font-medium">{money(invoice.totals.grandTotal)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Activity" description="Every mutating action writes an audit row." />
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Entity</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <tbody>
              {(audit.data ?? []).length === 0 ? (
                <EmptyRow colSpan={3}>No activity yet.</EmptyRow>
              ) : (
                audit.data!.map((log) => (
                  <tr key={log.id}>
                    <Td className="whitespace-nowrap text-muted-foreground">{shortDateTime(log.at)}</Td>
                    <Td>
                      <Badge>{log.entity}</Badge>
                    </Td>
                    <Td className="text-xs">{log.summary}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
