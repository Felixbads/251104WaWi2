import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Machines from "@/pages/Machines"; // Alte Maschinen-Komponente
import Automaten from "@/pages/Automaten"; // Neue Automaten-Komponente
import AutomatDetail from "@/pages/AutomatDetail"; // Detail-Ansicht eines Automaten
import Products from "@/pages/Products";
import Synchronization from "@/pages/Synchronization";
import SyncHistory from "@/pages/SyncHistory";
import Settings from "@/pages/Settings";
import Forecast from "@/pages/Forecast";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AppShell from "@/components/layout/AppShell";
import { AuthProvider, useAuth } from "@/lib";

// Importiere fehlende Komponenten
import Suppliers from "@/pages/Suppliers";
import Reporting from "@/pages/Reporting";
import Orders from "@/pages/Orders";
import NewOrder from "@/pages/NewOrder";
import Inventory from "@/pages/Inventory";
import Lager from "@/pages/Lager"; // Added Lager import


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
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/machines" component={Machines} />
        <Route path="/automaten" component={Automaten} />
        <Route path="/automaten/:id" component={AutomatDetail} />
        <Route path="/produkte" component={Products} />
        <Route path="/produkte/:id" component={() => <div>Produktdetails</div>} />
        <Route path="/lieferanten" component={Suppliers} />
        <Route path="/lieferanten/:id" component={() => <div>Lieferantendetails</div>} />
        <Route path="/bestellungen" component={Orders} />
        <Route path="/bestellungen/neu" component={NewOrder} />
        <Route path="/lager" component={Lager} /> {/* Added Lager route */}
        <Route path="/auswertungen" component={Reporting} />
        <Route path="/synchronization" component={Synchronization} />
        <Route path="/sync-history" component={SyncHistory} />
        <Route path="/forecast" component={Forecast} />
        <Route path="/settings" component={Settings} />
        <Route path="/:rest*" component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/:rest*">
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