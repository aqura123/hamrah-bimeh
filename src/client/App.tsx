import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { PublicLayout } from './components/layout/PublicLayout';
import { PortalLayout } from './components/layout/PortalLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { LoadingState } from './components/ui/Primitives';

// Public pages (eagerly loaded for instant public navigation)
import { HomePage } from './pages/public/HomePage';
import { DriversServicePage } from './pages/public/DriversServicePage';
import { EmployersServicePage } from './pages/public/EmployersServicePage';
import { GuidePage } from './pages/public/GuidePage';
import { ContactPage } from './pages/public/ContactPage';
import { LoginPage } from './pages/public/LoginPage';
import { ForceChangePasswordPage } from './pages/public/ForceChangePasswordPage';

// Customer portal pages (code-split)
const CustomerPortalPage = lazy(() =>
  import('./pages/portal/CustomerPortalPage').then((m) => ({ default: m.CustomerPortalPage })),
);
const ProfileHistoryPage = lazy(() =>
  import('./pages/portal/ProfileHistoryPage').then((m) => ({ default: m.ProfileHistoryPage })),
);
const NewRequestSelectionPage = lazy(() =>
  import('./pages/portal/NewRequestSelectionPage').then((m) => ({
    default: m.NewRequestSelectionPage,
  })),
);
const NewDriverRequestPage = lazy(() =>
  import('./pages/portal/NewDriverRequestPage').then((m) => ({
    default: m.NewDriverRequestPage,
  })),
);
const NewWorkshopRequestPage = lazy(() =>
  import('./pages/portal/NewWorkshopRequestPage').then((m) => ({
    default: m.NewWorkshopRequestPage,
  })),
);
const CustomerRequestDetailPage = lazy(() =>
  import('./pages/portal/CustomerRequestDetailPage').then((m) => ({
    default: m.CustomerRequestDetailPage,
  })),
);
const NotificationsView = lazy(() =>
  import('./pages/portal/PortalNotificationsPage').then((m) => ({
    default: m.NotificationsView,
  })),
);

// Office Admin pages (code-split)
const AdminRequestsPage = lazy(() =>
  import('./pages/admin/AdminRequestsPage').then((m) => ({ default: m.AdminRequestsPage })),
);
const AdminRequestDetailPage = lazy(() =>
  import('./pages/admin/AdminRequestDetailPage').then((m) => ({
    default: m.AdminRequestDetailPage,
  })),
);
const AdminCustomersPage = lazy(() =>
  import('./pages/admin/AdminCustomersPage').then((m) => ({ default: m.AdminCustomersPage })),
);
const AdminCustomerDetailPage = lazy(() =>
  import('./pages/admin/AdminCustomerDetailPage').then((m) => ({
    default: m.AdminCustomerDetailPage,
  })),
);
const AdminAuditPage = lazy(() =>
  import('./pages/admin/AdminAuditPage').then((m) => ({ default: m.AdminAuditPage })),
);

function PublicShellRoute() {
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}

function ProtectedCustomerShellRoute() {
  const { user, loading } = useApp();
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.forcePasswordChange) {
    return <Navigate to="/change-password" replace />;
  }
  if (user.role !== 'customer') {
    return <Navigate to="/admin" replace />;
  }
  return (
    <PortalLayout>
      <Suspense fallback={<LoadingState />}>
        <Outlet />
      </Suspense>
    </PortalLayout>
  );
}

function ProtectedAdminShellRoute() {
  const { user, loading } = useApp();
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.forcePasswordChange) {
    return <Navigate to="/change-password" replace />;
  }
  if (user.role !== 'office_admin') {
    return <Navigate to="/portal" replace />;
  }
  return (
    <AdminLayout>
      <Suspense fallback={<LoadingState />}>
        <Outlet />
      </Suspense>
    </AdminLayout>
  );
}

function NotFoundPage() {
  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-brand-navy">صفحه مورد نظر یافت نشد</h1>
        <p className="text-sm text-brand-muted leading-7">
          نشانی واردشده معتبر نیست یا صفحه جابه‌جا شده است.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-control bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-dark transition-colors"
        >
          بازگشت به صفحه اصلی
        </Link>
      </div>
    </PublicLayout>
  );
}

export function App() {
  return (
    <AppProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public Website */}
          <Route element={<PublicShellRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/drivers" element={<DriversServicePage />} />
            <Route path="/employers" element={<EmployersServicePage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Route>

          {/* Forced / Manual Password Change */}
          <Route path="/change-password" element={<ForceChangePasswordPage />} />

          {/* Customer Portal */}
          <Route path="/portal" element={<ProtectedCustomerShellRoute />}>
            <Route index element={<CustomerPortalPage />} />
            <Route path="drivers/:driverId" element={<ProfileHistoryPage kind="driver" />} />
            <Route path="workshops/:workshopId" element={<ProfileHistoryPage kind="workshop" />} />
            <Route path="requests/new" element={<NewRequestSelectionPage />} />
            <Route path="requests/new/driver" element={<NewDriverRequestPage />} />
            <Route path="requests/new/workshop" element={<NewWorkshopRequestPage />} />
            <Route path="requests/:requestId" element={<CustomerRequestDetailPage />} />
            <Route path="notifications" element={<NotificationsView mode="customer" />} />
          </Route>

          {/* Office Admin Panel */}
          <Route path="/admin" element={<ProtectedAdminShellRoute />}>
            <Route index element={<AdminRequestsPage />} />
            <Route path="requests/:requestId" element={<AdminRequestDetailPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="customers/:customerId" element={<AdminCustomerDetailPage />} />
            <Route path="notifications" element={<NotificationsView mode="admin" />} />
            <Route path="audit" element={<AdminAuditPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
