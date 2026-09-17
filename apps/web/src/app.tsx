import { useIsSuperAdmin, useRestoreSession, useSessionStore } from '@shop/state';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/app-shell';
import { RequireScreen } from './components/require-screen';
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

  /**
   * Re-establish the session from the cookie before deciding what to render.
   *
   * The session store lives in memory, so a refresh empties it while the cookie
   * outlives the page. Without this the app concluded nobody was signed in and
   * sent them back to the login screen on every single reload.
   */
  const { settled } = useRestoreSession();

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

  // Until the cookie has been checked there is no honest answer to "is this
  // person signed in", and guessing shows either a login screen to someone who
  // is, or a flash of the app to someone who is not. The download page is
  // exempt: it exists for people who cannot get in, so it must not wait on a
  // call that may be what is failing.
  if (!settled) {
    return (
      <Routes>
        {downloadRoute}
        <Route
          path="*"
          element={
            <div className="flex min-h-screen items-center justify-center bg-background">
              <p className="text-sm text-muted-foreground">Restoring your session…</p>
            </div>
          }
        />
      </Routes>
    );
  }

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
          element={
            <RequireScreen screen="view.home">
              {hasStore ? <HomePage /> : <Navigate to="/onboarding/locations" replace />}
            </RequireScreen>
          }
        />

        <Route path="sales">
          <Route index element={<Navigate to="/sales/billing" replace />} />
          <Route path="billing" element={<RequireScreen screen="view.sales.billing"><QuickBillingPage /></RequireScreen>} />
          <Route path="orders" element={<RequireScreen screen="view.sales.orders"><OrdersPage /></RequireScreen>} />
          <Route path="invoices" element={<RequireScreen screen="view.sales.invoices"><InvoicesPage /></RequireScreen>} />
          <Route path="returns" element={<RequireScreen screen="view.sales.returns"><ReturnsPage /></RequireScreen>} />
        </Route>

        <Route path="inventory">
          <Route index element={<Navigate to="/inventory/stores" replace />} />
          <Route path="stores" element={<RequireScreen screen="view.inventory.stores"><StoreStockPage /></RequireScreen>} />
          <Route path="warehouses" element={<RequireScreen screen="view.inventory.warehouses"><WarehouseStockPage /></RequireScreen>} />
          <Route path="all" element={<RequireScreen screen="view.inventory.all"><AllInventoryPage /></RequireScreen>} />
          {/* Old single-screen route */}
          <Route path="overview" element={<Navigate to="/inventory/stores" replace />} />
          <Route path="products" element={<Navigate to="/onboarding/products" replace />} />
          <Route path="transfers" element={<RequireScreen screen="view.inventory.transfers"><TransfersPage /></RequireScreen>} />
          <Route path="replenishment" element={<RequireScreen screen="view.inventory.replenishment"><ReplenishmentPage /></RequireScreen>} />
          <Route path="movements" element={<RequireScreen screen="view.inventory.movements"><MovementsPage /></RequireScreen>} />
        </Route>

        <Route path="onboarding">
          <Route index element={<Navigate to="/onboarding/locations" replace />} />
          <Route path="locations" element={<RequireScreen screen="view.onboarding.locations"><OnboardLocationsPage /></RequireScreen>} />
          <Route path="products" element={<RequireScreen screen="view.onboarding.products"><ProductsPage /></RequireScreen>} />
          <Route path="users" element={<RequireScreen screen="view.onboarding.users"><OnboardUsersPage /></RequireScreen>} />
          <Route path="masters" element={<RequireScreen screen="view.onboarding.masters"><OnboardMastersPage /></RequireScreen>} />
        </Route>

        <Route path="purchases" element={<RequireScreen screen="view.purchases"><PurchasesPage /></RequireScreen>} />
        <Route path="closing">
          <Route index element={<Navigate to="/closing/day-end" replace />} />
          <Route path="day-end" element={<RequireScreen screen="view.closing.dayend"><DayEndClosingPage /></RequireScreen>} />
          <Route path="reconciliation" element={<RequireScreen screen="view.closing.reconciliation"><ReconciliationPage /></RequireScreen>} />
        </Route>
        <Route path="admin" element={<RequireScreen screen="view.admin"><AdministrationPage /></RequireScreen>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
