import { useIsSuperAdmin, useSessionStore } from '@shop/state';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/app-shell';
import { PlatformConsolePage } from './pages/platform/companies';
import { AdministrationPage } from './pages/administration';
import { DayEndClosingPage } from './pages/closing/day-end';
import { DownloadPage } from './pages/download';
import { HomePage } from './pages/home';
import { MovementsPage } from './pages/inventory/movements';
import { OnboardLocationsPage } from './pages/onboarding/locations';
import { OnboardMastersPage } from './pages/onboarding/masters';
import { OnboardUsersPage } from './pages/onboarding/users';
import { ProductsPage } from './pages/onboarding/products';
import { AllInventoryPage } from './pages/inventory/all-inventory';
import { StoreStockPage } from './pages/inventory/stores';
import { WarehouseStockPage } from './pages/inventory/warehouses';
import { TransfersPage } from './pages/inventory/transfers';
import { LoginPage } from './pages/login';
import { PurchasesPage } from './pages/purchases/index';
import { OrdersPage } from './pages/sales/orders';
import { ReturnsPage } from './pages/sales/returns';
import { ReplenishmentPage } from './pages/inventory/replenishment';
import { ReconciliationPage } from './pages/closing/reconciliation';
import { InvoicesPage } from './pages/sales/invoices';
import { QuickBillingPage } from './pages/sales/quick-billing';

export function App() {
  const theme = useSessionStore((s) => s.theme);
  const isAuthenticated = useSessionStore((s) => s.user !== null);
  const isSuperAdmin = useIsSuperAdmin();
  // An admin who has just created a company signs in before any store exists.
  // Home would render — every widget takes an optional store — but it would be
  // a screen of empty cards with no hint that the first thing to do is add a
  // location.
  const hasStore = useSessionStore((s) => s.store !== null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // A super admin has no company and no store, so none of the retail modules
  // can render for them. They get the platform console and nothing else.
  // Listed in every branch below rather than once at the top, because each
  // branch renders its own <Routes> tree. It has to appear in all three: a new
  // cashier needs the app before they have anything to sign in with, so gating
  // the download behind a session would be circular.
  const downloadRoute = <Route path="/download" element={<DownloadPage />} />;

  if (isAuthenticated && isSuperAdmin) {
    return (
      <Routes>
        {downloadRoute}
        <Route path="*" element={<PlatformConsolePage />} />
      </Routes>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        {downloadRoute}
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {downloadRoute}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route
          index
          element={hasStore ? <HomePage /> : <Navigate to="/onboarding/locations" replace />}
        />

        <Route path="sales">
          <Route index element={<Navigate to="/sales/billing" replace />} />
          <Route path="billing" element={<QuickBillingPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="returns" element={<ReturnsPage />} />
        </Route>

        <Route path="inventory">
          <Route index element={<Navigate to="/inventory/stores" replace />} />
          <Route path="stores" element={<StoreStockPage />} />
          <Route path="warehouses" element={<WarehouseStockPage />} />
          <Route path="all" element={<AllInventoryPage />} />
          {/* Old single-screen route */}
          <Route path="overview" element={<Navigate to="/inventory/stores" replace />} />
          <Route path="products" element={<Navigate to="/onboarding/products" replace />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="replenishment" element={<ReplenishmentPage />} />
          <Route path="movements" element={<MovementsPage />} />
        </Route>

        <Route path="onboarding">
          <Route index element={<Navigate to="/onboarding/locations" replace />} />
          <Route path="locations" element={<OnboardLocationsPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="users" element={<OnboardUsersPage />} />
          <Route path="masters" element={<OnboardMastersPage />} />
        </Route>

        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="closing">
          <Route index element={<Navigate to="/closing/day-end" replace />} />
          <Route path="day-end" element={<DayEndClosingPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
        </Route>
        <Route path="admin" element={<AdministrationPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
