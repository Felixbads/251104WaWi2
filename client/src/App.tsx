import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Machines from "@/pages/Machines";
import Products from "@/pages/Products";
import Synchronization from "@/pages/Synchronization";
import SyncHistory from "@/pages/SyncHistory";
import Settings from "@/pages/Settings";
import Forecast from "@/pages/Forecast";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AppShell from "@/components/layout/AppShell";
import { AuthProvider, useAuth } from "@/lib";

// Geschützte Route Komponente
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  
  // Während des Ladens zeigen wir nichts an
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Lade...</div>;
  }
  
  if (!isAuthenticated) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }
  
  return <Component {...rest} />;
}

// Authentifizierte und nicht-authentifizierte Router
function AuthenticatedRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/machines" component={Machines} />
        <Route path="/products" component={Products} />
        <Route path="/synchronization" component={Synchronization} />
        <Route path="/sync-history" component={SyncHistory} />
        <Route path="/forecast" component={Forecast} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route>
        <Redirect to="/login" />
      </Route>
    </Switch>
  );
}

// Haupt-App-Komponente
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MainRouter />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Haupt-Router, der zwischen authentifizierten und öffentlichen Routen entscheidet
function MainRouter() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AuthenticatedRouter /> : <PublicRouter />;
}

export default App;
