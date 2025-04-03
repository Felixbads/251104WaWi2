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
import SyncPage from "@/pages/SyncPage";
import Settings from "@/pages/Settings";
import Forecast from "@/pages/Forecast";
import ForecastEvaluation from "@/pages/ForecastEvaluation";
import DataAvailability from "@/pages/DataAvailability"; // Neue Datenverfügbarkeits-Komponente
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import NotApproved from "@/pages/NotApproved"; // Seite für nicht-freigegebene Benutzer
import Unauthorized from "@/pages/Unauthorized"; // Seite für nicht-autorisierte Benutzer
import AppShell from "@/components/layout/AppShell";
import Layout from "@/components/layout/Layout";
import { AuthProvider, useAuth } from "@/lib";
import AdminRoute from "@/components/auth/AdminRoute"; // Route nur für Admins
import ApprovedUserRoute from "@/components/auth/ApprovedUserRoute"; // Route für genehmigte Benutzer

/**
 * HOC, der eine geschützte Route mit Benutzerfreigabe-Prüfung erstellt
 */
function withAuth(WrappedComponent: React.ComponentType<any>) {
  return function WithAuthComponent(props: any) {
    const { isAuthenticated, isLoading, user } = useAuth();
    const [location] = useLocation();
    
    // Während des Ladens zeigen wir nichts an
    if (isLoading) {
      return <div className="flex items-center justify-center h-screen">Lade...</div>;
    }
    
    if (!isAuthenticated) {
      // Wir entfernen führende Slashes aus dem Location-String für die Weiterleitung
      const cleanLocation = location.startsWith('/') ? location.slice(1) : location;
      return <Redirect to={`/login?redirect=${encodeURIComponent(cleanLocation)}`} />;
    }
    
    // Wenn der Benutzer nicht freigegeben ist und die Route nicht "/nicht-freigegeben" ist
    if (user && !user.approved && location !== '/nicht-freigegeben') {
      return <Redirect to="/nicht-freigegeben" />;
    }
    
    return <WrappedComponent {...props} />;
  };
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
import UserManagement from "@/pages/UserManagement";

// Authentifizierte und nicht-authentifizierte Router
function AuthenticatedRouter() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  // Anwenden des withAuth-HOC auf alle Komponenten, die Authentifizierung erfordern
  const ProtectedDashboard = withAuth(Dashboard);
  const ProtectedTransactions = withAuth(Transactions);
  const ProtectedMachines = withAuth(Machines);
  const ProtectedAutomaten = withAuth(Automaten);
  const ProtectedAutomatDetail = withAuth(AutomatDetail);
  const ProtectedRefillDetail = withAuth(RefillDetail);
  const ProtectedProducts = withAuth(Products);
  const ProtectedProductDetail = withAuth(ProductDetail);
  const ProtectedSuppliers = withAuth(Suppliers);
  const ProtectedSupplierDetail = withAuth(SupplierDetail);
  const ProtectedOrders = withAuth(Orders);
  const ProtectedNewOrder = withAuth(NewOrder);
  const ProtectedOrderDetail = withAuth(OrderDetail);
  const ProtectedOrderReceipt = withAuth(OrderReceipt);
  const ProtectedSupplierPortal = withAuth(SupplierPortal);
  const ProtectedLagerPage = withAuth(LagerPage);
  const ProtectedInventory = withAuth(Inventory);
  const ProtectedWarehouseDetail = withAuth(WarehouseDetail);
  const ProtectedWarenentnahmePage = withAuth(WarenentnahmePage);
  const ProtectedWarenentnahmeNew = withAuth(WarenentnahmeNew);
  const ProtectedWarenentnahmeDetail = withAuth(WarenentnahmeDetail);
  const ProtectedDataAvailability = withAuth(DataAvailability);
  const ProtectedSynchronization = withAuth(Synchronization);
  const ProtectedSyncHistory = withAuth(SyncHistory);
  const ProtectedSyncPage = withAuth(SyncPage);
  const ProtectedForecast = withAuth(Forecast);
  const ProtectedForecastEvaluation = withAuth(ForecastEvaluation);
  const ProtectedSettings = withAuth(Settings);

  return (
    <Layout>
      <Switch>
        {/* Öffentliche Routen */}
        <Route path="/nicht-freigegeben" component={NotApproved} />
        <Route path="/unauthorized" component={Unauthorized} />
        
        {/* Geschützte Routen, die Freigabe erfordern */}
        <Route path="/" component={props => (
          <ApprovedUserRoute>
            <Dashboard {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/transactions" component={props => (
          <ApprovedUserRoute>
            <Transactions {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/machines" component={props => (
          <ApprovedUserRoute>
            <Machines {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/automaten" component={props => (
          <ApprovedUserRoute>
            <Automaten {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/automaten/:id" component={props => (
          <ApprovedUserRoute>
            <AutomatDetail {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/automaten/:id/refills/:refillId" component={props => (
          <ApprovedUserRoute>
            <RefillDetail {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/produkte" component={props => (
          <ApprovedUserRoute>
            <Products {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/produkte/:id" component={props => (
          <ApprovedUserRoute>
            <ProductDetail {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/lieferanten" component={props => (
          <ApprovedUserRoute>
            <Suppliers {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/lieferanten/:id" component={props => (
          <ApprovedUserRoute>
            <SupplierDetail {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/bestellungen" component={props => (
          <ApprovedUserRoute>
            <Orders {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/bestellungen/neu" component={props => (
          <ApprovedUserRoute>
            <NewOrder {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/bestellungen/:id" component={props => (
          <ApprovedUserRoute>
            <OrderDetail {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/bestellungen/:id/wareneingang" component={props => (
          <ApprovedUserRoute>
            <OrderReceipt {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/lieferantenportal" component={props => (
          <ApprovedUserRoute>
            <SupplierPortal {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/lager" component={props => (
          <ApprovedUserRoute>
            <LagerPage {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/inventory" component={props => (
          <ApprovedUserRoute>
            <Inventory {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/lager/:id" component={props => (
          <ApprovedUserRoute>
            <WarehouseDetail {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/warenentnahme" component={props => (
          <ApprovedUserRoute>
            <WarenentnahmePage {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/warenentnahme/new" component={props => (
          <ApprovedUserRoute>
            <WarenentnahmeNew {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/warenentnahme/:id" component={props => (
          <ApprovedUserRoute>
            <WarenentnahmeDetail {...props} />
          </ApprovedUserRoute>
        )} />
        
        {/* Nur Admin kann die Auswertungsseite sehen */}
        <Route path="/auswertungen" component={props => (
          <AdminRoute>
            <Reporting {...props} />
          </AdminRoute>
        )} />
        
        <Route path="/datenverfuegbarkeit" component={props => (
          <ApprovedUserRoute>
            <DataAvailability {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/synchronization" component={props => (
          <ApprovedUserRoute>
            <Synchronization {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/sync-history" component={props => (
          <ApprovedUserRoute>
            <SyncHistory {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/sync" component={props => (
          <ApprovedUserRoute>
            <SyncPage {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/forecast" component={props => (
          <ApprovedUserRoute>
            <Forecast {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/forecast-evaluation" component={props => (
          <ApprovedUserRoute>
            <ForecastEvaluation {...props} />
          </ApprovedUserRoute>
        )} />
        
        <Route path="/settings" component={props => (
          <ApprovedUserRoute>
            <Settings {...props} />
          </ApprovedUserRoute>
        )} />
        
        {/* Benutzer-Verwaltung für Admins */}
        <Route path="/benutzer" component={props => (
          <AdminRoute>
            <UserManagement {...props} />
          </AdminRoute>
        )} />
        
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
  return isAuthenticated ? <AuthenticatedRouter /> : <PublicRouter />;
}

export default App;
