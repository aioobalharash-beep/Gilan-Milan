import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ScrollToTop } from './components/ScrollToTop';

// Layouts loaded eagerly (small, shared shell)
import { Layout } from './components/Layout';
import { ClientLayout } from './components/ClientLayout';

// ── Guest / Public pages ──
const Sanctuary = lazy(() => import('./components/Sanctuary').then(m => ({ default: m.Sanctuary })));
const Booking = lazy(() => import('./components/Booking').then(m => ({ default: m.Booking })));
const Confirmation = lazy(() => import('./components/Confirmation').then(m => ({ default: m.Confirmation })));
const Testimonials = lazy(() => import('./components/Testimonials').then(m => ({ default: m.Testimonials })));
const Terms = lazy(() => import('./components/Terms').then(m => ({ default: m.Terms })));
const About = lazy(() => import('./components/About').then(m => ({ default: m.About })));
const Login = lazy(() => import('./components/Login').then(m => ({ default: m.Login })));

// ── Admin pages (completely separate chunk) ──
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Calendar = lazy(() => import('./components/Calendar').then(m => ({ default: m.Calendar })));
const Guests = lazy(() => import('./components/Guests').then(m => ({ default: m.Guests })));
const Invoices = lazy(() => import('./components/Invoices').then(m => ({ default: m.Invoices })));
const Reports = lazy(() => import('./components/Reports').then(m => ({ default: m.Reports })));
const PropertyEditor = lazy(() => import('./components/PropertyEditor').then(m => ({ default: m.PropertyEditor })));

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user || !isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-pearl-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold font-headline text-primary-navy">Woody Chalete</h1>
        <div className="w-8 h-8 border-2 border-primary-navy/20 border-t-secondary-gold rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, isAdmin, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public / Client Routes */}
        <Route path="/" element={<ClientLayout />}>
          <Route index element={<Sanctuary />} />
          <Route path="booking" element={<Booking />} />
          <Route path="testimonials" element={<Testimonials />} />
          <Route path="terms" element={<Terms />} />
          <Route path="about" element={<About />} />
          <Route path="confirmation" element={<Confirmation />} />
        </Route>

        {/* Auth */}
        <Route path="/login" element={user ? <Navigate to={isAdmin ? '/admin' : '/'} replace /> : <Login />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminRoute><Layout /></AdminRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="guests" element={<Guests />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="reports" element={<Reports />} />
          <Route path="edit-property" element={<PropertyEditor />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <LanguageProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
