import React, { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LoginScreen } from './components/LoginScreen';
import { Radio } from 'lucide-react';

const AdminLayout = lazy(() => import('./components/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const ClientLiveSMS = lazy(() => import('./components/client/ClientLiveSMS').then(m => ({ default: m.ClientLiveSMS })));

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 gap-3">
      <div className="relative">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <Radio className="w-6 h-6 text-emerald-400 animate-pulse" />
        </div>
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
      </div>
      <span className="text-xs font-mono text-emerald-400 tracking-wider font-semibold uppercase">
        KB MAX • Initializing Gateway...
      </span>
    </div>
  );
}

function AppContent() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingFallback />;
  }

  // Not logged in -> Show Role-based Login with instantaneous loading
  if (!session) {
    return <LoginScreen />;
  }

  // Admin Role -> Full Admin Panel (Dashboard, API Providers, Clients, Live SMS, Settings, Logout)
  if (session.role === 'admin') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AdminLayout />
      </Suspense>
    );
  }

  // Client Role -> Isolated Live SMS Screen ONLY with 5-min session timer
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ClientLiveSMS />
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
