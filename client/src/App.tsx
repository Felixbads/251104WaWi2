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
import RefillDetail from "@/pages/RefillDetail"; // Detail-Ansicht einer Auffüllung
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail"; // Detail-Ansicht eines Produkts
import Synchronization from "@/pages/Synchronization";
import SyncHistory from "@/pages/SyncHistory";
import Settings from "@/pages/Settings";
import Forecast from "@/pages/Forecast";
import ForecastEvaluation from "@/pages/ForecastEvaluation";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AppShell from "@/components/layout/AppShell";
import Layout from "@/components/layout/Layout";
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

// Importiere fehlende Komponenten
import Suppliers from "@/pages/Suppliers";
import SupplierDetail from "@/pages/SupplierDetail";
import Reporting from "@/pages/Reporting";
import Orders from "@/pages/Orders";
import NewOrder from "@/pages/NewOrder";
import OrderDetail from "@/pages/OrderDetail";
import OrderReceipt from "@/pages/OrderReceipt";
import SupplierPortal from "@/pages/SupplierPortal";
import Inventory from "@/pages/Inventory";
import LagerPage from "@/pages/LagerPage";
import WarehouseDetail from "@/pages/WarehouseDetail";
import WarenentnahmePage from "@/pages/WarenentnahmePage";
import WarenentnahmeDetail from "@/pages/WarenentnahmeDetail";
import WarenentnahmeNew from "@/pages/WarenentnahmeNew";

// Authentifizierte und nicht-authentifizierte Router
function AuthenticatedRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/machines" component={Machines} />
        <Route path="/automaten" component={Automaten} />
        <Route path="/automaten/:id" component={AutomatDetail} />
        <Route path="/automaten/:id/refills/:refillId" component={RefillDetail} />
        <Route path="/produkte" component={Products} />
        <Route path="/produkte/:id" component={ProductDetail} />
        <Route path="/lieferanten" component={Suppliers} />
        <Route path="/lieferanten/:id" component={SupplierDetail} />
        <Route path="/bestellungen" component={Orders} />
        <Route path="/bestellungen/neu" component={NewOrder} />
        <Route path="/bestellungen/:id" component={OrderDetail} />
        <Route path="/bestellungen/:id/wareneingang" component={OrderReceipt} />
        <Route path="/lieferantenportal" component={SupplierPortal} />
        <Route path="/lager" component={LagerPage} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/lager/:id" component={WarehouseDetail} />
        <Route path="/warenentnahme" component={WarenentnahmePage} />
        <Route path="/warenentnahme/new" component={WarenentnahmeNew} />
        <Route path="/warenentnahme/:id" component={WarenentnahmeDetail} />
        <Route path="/auswertungen" component={Reporting} />
        <Route path="/synchronization" component={Synchronization} />
        <Route path="/sync-history" component={SyncHistory} />
        <Route path="/forecast" component={Forecast} />
        <Route path="/forecast-evaluation" component={ForecastEvaluation} />
        <Route path="/settings" component={Settings} />
        <Route path="/:rest*" component={(props: any) => {
          const rest = props.params?.rest;
          return <NotFound title="Seite nicht gefunden" message={`Der Pfad /${Array.isArray(rest) ? rest.join('/') : rest || ''} existiert nicht.`} />;
        }} />
      </Switch>
    </Layout>
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
  const { isAuthenticated, user } = useAuth();
  console.log("Auth status:", { isAuthenticated, user });
  // Immer die authentifizierten Routen anzeigen, unabhängig vom Auth-Status (für Demozwecke)
  return <AuthenticatedRouter />;
  // Original: return isAuthenticated ? <AuthenticatedRouter /> : <PublicRouter />;
}

export default App;
