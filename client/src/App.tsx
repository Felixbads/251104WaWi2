import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Machines from "@/pages/Machines"; // Alte Maschinen-Komponente
import Automaten from "@/pages/Automaten"; // Neue Automaten-Komponente
import Automaten2 from "@/pages/Automaten2"; // Noch neuere Automaten-Komponente
import StandortStatus from "@/pages/StandortStatus"; // Standort-Status-Übersicht
import StandortAnalyse from "@/pages/StandortAnalyse"; // Standort-Analyse mit Verkäufen vs. Entnahmen
import AutomatDetail from "@/pages/AutomatDetail"; // Detail-Ansicht eines Automaten
import RefillDetail from "@/pages/RefillDetail"; // Detail-Ansicht einer Auffüllung
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail"; // Detail-Ansicht eines Produkts
import ProductDataEntry from "@/pages/ProductDataEntry"; // Tabellarische Produktdatenbearbeitung
import WarenbewegungNewPage from "@/pages/WarenbewegungNewPage"; // Neue Warenumlagerung-Komponente
import SyncDashboard from "@/pages/SyncDashboard";
import SyncHistory from "@/pages/SyncHistory";
import Settings from "@/pages/Settings";
import MailSettings from "@/pages/MailSettings"; // Neue Email-Einstellungen-Seite
import Forecast from "@/pages/Forecast";
import ForecastEvaluation from "@/pages/ForecastEvaluation";
import ForecastDetail from "@/pages/ForecastDetail";
import EnhancedForecastDashboard from "@/pages/EnhancedForecastDashboard";
import DataAvailability from "@/pages/DataAvailability"; // Neue Datenverfügbarkeits-Komponente
import AdvancedAnalysis from "@/pages/AdvancedAnalysis"; // Erweiterte Analyse-Komponente
import ProfitabilityAnalysis from "@/pages/ProfitabilityAnalysis"; // Wirtschaftlichkeitsauswertung
import Wirtschaftlichkeit from "@/pages/Wirtschaftlichkeit"; // Neue Wirtschaftlichkeitsseite
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import NotApproved from "@/pages/NotApproved"; // Seite für nicht-freigegebene Benutzer
import Unauthorized from "@/pages/Unauthorized"; // Seite für nicht-autorisierte Benutzer
import AppShell from "@/components/layout/AppShell";
import Layout from "@/components/layout/Layout";
import { AuthProvider, useAuth } from "@/lib";
import AdminRoute from "@/components/auth/AdminRoute"; // Route nur für Admins
import ApprovedUserRoute from "@/components/auth/ApprovedUserRoute"; // Route für genehmigte Benutzer
import { InventoryCartProvider } from "@/components/inventory/InventoryCartContext";
import InterAppConnections from "@/pages/InterAppConnections";
import SupplierPortal from "@/pages/SupplierPortal";

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
import SuppliersFast from "@/pages/SuppliersFast";
import SupplierDetail from "@/pages/SupplierDetail";
import OrderDeliveryOverview from "@/pages/OrderDeliveryOverview";
import Reporting from "@/pages/Reporting";
import Orders from "@/pages/Orders";
import NewOrder from "@/pages/NewOrder";
import BestellungV2 from "@/pages/BestellungV2"; // Neue Bestellung 2.0 Seite
// import BestellungenV4 from "@/pages/BestellungenV4"; // Kompletter Bestellprozess V4 - temporarily disabled
// BestellungV3 wurde entfernt
import OrderDetail from "@/pages/OrderDetail";
import OrderReceipt from "@/pages/OrderReceipt";
import EnhancedOrdering from "@/pages/EnhancedOrdering";
import Inventory from "@/pages/Inventory";
import LagerPage from "@/pages/LagerPage";
import Lagerhaltung from "@/pages/Lagerhaltung";
import LagerNew from "@/pages/LagerNew";
import WarehouseDetail from "@/pages/WarehouseDetail";
import WarehouseDetailPage from "@/pages/WarehouseDetailPage";
import WarehouseMovements from "@/pages/WarehouseMovements";
// import WarenentnahmePage from "@/pages/WarenentnahmePage";
// import WarenentnahmeDetail from "@/pages/WarenentnahmeDetail";
// import WarenentnahmeNew from "@/pages/WarenentnahmeNew";
import InventoryMovementNew from "@/pages/InventoryMovementNew";
import UserManagement from "@/pages/UserManagement";
import InventurPage from "@/pages/InventurPage";
import InventurDetailPage from "@/pages/InventurDetailPage";
import InventurDetailNewPage from "@/pages/InventurDetailNewPage";
import InventurCreationPage from "@/pages/InventurCreationPage";
// Neue Lagerbestandsseiten importieren
import WarehouseInventoryPage from "@/pages/warehouse/WarehouseInventoryPage";
import WarehouseOverviewPage from "@/pages/warehouse/WarehouseOverviewPage";
import WarehouseMovement from "@/pages/WarehouseMovement";
import LagerbestandPage from "@/pages/LagerbestandPage";
import SustainableVending from "@/pages/SustainableVending";
import ProductForecastPage from "@/pages/ProductForecastPage";
import WeatherDataOverview from "@/pages/WeatherDataOverview";
import WeatherVisualization from "@/pages/WeatherVisualization";
import HolidaysVacationsOverview from "@/pages/HolidaysVacationsOverview";
import HolidayAnalysisDashboard from "@/pages/HolidayAnalysisDashboard";
import DatabaseManager from "@/pages/DatabaseManager";
import CriticalInventory from "@/pages/CriticalInventory";
import Ruecklaufer from "@/pages/Ruecklaufer";
import RevenueExpectations from "@/pages/RevenueExpectations";
import OrdersOverviewPage from "@/pages/OrdersOverviewPage";
import SupportTicket from "@/pages/SupportTicket";
import VendonSync from "@/pages/admin/VendonSync";

// Authentifizierte und nicht-authentifizierte Router
function AuthenticatedRouter() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [location] = useLocation();
  
  // DEBUG: Log current location and user status
  console.log('[APP-ROUTER] AuthenticatedRouter rendered:', { location, user: user?.email, isAdmin });

  // Da wir bereits direkte Weiterleitungen im Login-Prozess haben,
  // ist keine weitere Umleitung für "/" und "/login" nötig

  // Wir entfernen die withAuth-HOCs, da wir jetzt ApprovedUserRoute und AdminRoute verwenden

  return (
    <Layout>
      <Switch>
        {/* Öffentliche Routen */}
        <Route path="/nicht-freigegeben" component={NotApproved} />
        <Route path="/unauthorized" component={Unauthorized} />
        
        {/* Lieferanten-Portal Route - öffentlich zugänglich */}
        <Route path="/lieferant/:accessToken">
          {(params) => {
            console.log('PORTAL ROUTE MATCHED:', params);
            return <SupplierPortal />;
          }}
        </Route>

        {/* Geschützte Routen, die Freigabe erfordern */}
        <Route path="/login">
          {() => (
            <ApprovedUserRoute>
              <Dashboard />
            </ApprovedUserRoute>
          )}
        </Route>

        <Route path="/">
          <Redirect to="/login" />
        </Route>

        <Route path="/transactions">
          {() => (
            <ApprovedUserRoute>
              <Transactions />
            </ApprovedUserRoute>
          )}
        </Route>

        <Route path="/nachhaltigkeit">
          {() => (
            <ApprovedUserRoute>
              <SustainableVending />
            </ApprovedUserRoute>
          )}
        </Route>

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

        <Route path="/automaten2" component={props => (
          <ApprovedUserRoute>
            <Automaten2 {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/standort-status" component={props => (
          <ApprovedUserRoute>
            <StandortStatus {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/standort-analyse" component={props => (
          <ApprovedUserRoute>
            <StandortAnalyse {...props} />
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

        <Route path="/produkte/neu" component={props => (
          <ApprovedUserRoute>
            <ProductDetail {...props} isNew={true} />
          </ApprovedUserRoute>
        )} />

        <Route path="/produkte/bearbeiten" component={props => (
          <ApprovedUserRoute>
            <ProductDataEntry {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/product-data-entry" component={props => (
          <ApprovedUserRoute>
            <ProductDataEntry {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/produkte/:id" component={props => (
          <ApprovedUserRoute>
            <ProductDetail {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/lieferanten" component={props => (
          <ApprovedUserRoute>
            <SuppliersFast {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/lieferanten/:id" component={props => (
          <ApprovedUserRoute>
            <SupplierDetail {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/lieferanten-planung" component={props => (
          <ApprovedUserRoute>
            <OrderDeliveryOverview {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Spezifische Routen MÜSSEN vor dynamischen Routen stehen */}
        {/* BestellungenV4 temporarily disabled */}

        <Route path="/bestellungen/neu-v2" component={props => (
          <ApprovedUserRoute>
            <BestellungV2 {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Bestellungen Overview - Main orders list page */}
        <Route path="/bestellungen" component={props => (
          <ApprovedUserRoute>
            <OrdersOverviewPage {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Bestellungen Workflow - Dynamic order workflow */}
        <Route path="/bestellungen/workflow" component={props => (
          <ApprovedUserRoute>
            <BestellungV2 {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Neue Bestellungen - Order creation process */}
        <Route path="/bestellungen/neu" component={props => (
          <ApprovedUserRoute>
            <BestellungV2 {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Legacy route for compatibility */}
        <Route path="/bestellungen/neu-v2" component={props => (
          <ApprovedUserRoute>
            <BestellungV2 {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Enhanced ordering process with smart cart and forecasting */}
        <Route path="/bestellungen/enhanced" component={props => (
          <ApprovedUserRoute>
            <EnhancedOrdering {...props} />
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

        <Route path="/lager-neu" component={props => (
          <ApprovedUserRoute>
            <LagerNew {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/lagerhaltung" component={props => (
          <ApprovedUserRoute>
            <Lagerhaltung {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/inventory" component={props => (
          <ApprovedUserRoute>
            <Inventory {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/inventory/movements/new" component={props => (
          <ApprovedUserRoute>
            <InventoryMovementNew {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/warehouses/:id" component={props => (
          <ApprovedUserRoute>
            <WarehouseDetail {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/warehouse/:id" component={props => (
          <ApprovedUserRoute>
            <WarehouseDetailPage {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/lagerbestand-neu" component={props => (
          <ApprovedUserRoute>
            <LagerbestandPage {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/kritische-bestaende" component={props => (
          <ApprovedUserRoute>
            <CriticalInventory {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/ruecklaufer" component={props => (
          <ApprovedUserRoute>
            <Ruecklaufer {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/lagerbestand" component={props => (
          <ApprovedUserRoute>
            <WarehouseOverviewPage {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/lagerbestand/:id" component={props => (
          <ApprovedUserRoute>
            <WarehouseInventoryPage {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/warehouses/:id/warenbewegung" component={props => (
          <ApprovedUserRoute>
            <WarehouseMovements {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Warenbewegung (Warenumlagerung) Route */}
        <Route path="/warenbewegung" component={props => (
          <ApprovedUserRoute>
            <WarenbewegungNewPage {...props} />
          </ApprovedUserRoute>
        )} />
        {/* Alte Routen auskommentiert (können später entfernt werden) */}
        {/* <Route path="/warenentnahme" component={props => (
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
        )} /> */}

        {/* Inventur-Seiten */}
        <Route path="/inventur" component={props => (
          <ApprovedUserRoute>
            <InventurPage {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/inventur/neu" component={props => (
          <ApprovedUserRoute>
            <InventurCreationPage {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Inventur-Detailseite */}
        <Route path="/inventur/:id" component={props => (
          <ApprovedUserRoute>
            <InventurDetailNewPage {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Neue verbesserte Inventur-Detailseite */}
        <Route path="/inventur-detail/:id" component={props => (
          <ApprovedUserRoute>
            <InventurDetailNewPage {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Nur Admin kann die Auswertungsseite sehen */}
        <Route path="/auswertungen" component={props => (
          <AdminRoute>
            <Reporting {...props} />
          </AdminRoute>
        )} />

        <Route path="/erweiterte-analyse" component={props => (
          <AdminRoute>
            <AdvancedAnalysis {...props} />
          </AdminRoute>
        )} />

        <Route path="/auswertungen" component={props => (
          <ApprovedUserRoute>
            <ProfitabilityAnalysis {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/wirtschaftlichkeit" component={props => (
          <ApprovedUserRoute>
            <Wirtschaftlichkeit {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/datenverfuegbarkeit" component={props => (
          <ApprovedUserRoute>
            <DataAvailability {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/support" component={props => (
          <ApprovedUserRoute>
            <SupportTicket {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/datenverfuegbarkeit/wetter" component={props => (
          <ApprovedUserRoute>
            <WeatherDataOverview {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/datenverfuegbarkeit/wetter-visualisierung" component={props => (
          <ApprovedUserRoute>
            <WeatherVisualization {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/datenverfuegbarkeit/feiertage" component={props => (
          <ApprovedUserRoute>
            <HolidaysVacationsOverview {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/feiertage-analyse" component={props => (
          <ApprovedUserRoute>
            <HolidayAnalysisDashboard {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/synchronization" component={props => (
          <ApprovedUserRoute>
            <SyncDashboard {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/sync-history" component={props => (
          <ApprovedUserRoute>
            <SyncHistory {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/sync" component={props => (
          <ApprovedUserRoute>
            <SyncDashboard {...props} />
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
        
        <Route path="/forecast-detail" component={props => (
          <ApprovedUserRoute>
            <ForecastDetail {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/enhanced-forecast" component={props => (
          <ApprovedUserRoute>
            <EnhancedForecastDashboard {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/product-forecasts" component={props => (
          <ApprovedUserRoute>
            <ProductForecastPage {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/revenue-expectations" component={props => (
          <ApprovedUserRoute>
            <RevenueExpectations {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/settings" component={props => (
          <ApprovedUserRoute>
            <Settings {...props} />
          </ApprovedUserRoute>
        )} />

        <Route path="/email-einstellungen" component={props => (
          <ApprovedUserRoute>
            <MailSettings {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Nachhaltigkeits-Tracker */}
        <Route path="/nachhaltigkeit" component={props => (
          <ApprovedUserRoute>
            <SustainableVending {...props} />
          </ApprovedUserRoute>
        )} />

        {/* Datenbank-Manager für Admins */}
        <Route path="/database-manager" component={props => (
          <AdminRoute>
            <DatabaseManager {...props} />
          </AdminRoute>
        )} />

        {/* Benutzer-Verwaltung für Admins */}
        <Route path="/benutzer">
          {() => (
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          )}
        </Route>

        {/* Inter-App Verbindungen für Admins */}
        <Route path="/inter-app-verbindungen" component={props => (
          <AdminRoute>
            <InterAppConnections {...props} />
          </AdminRoute>
        )} />

        {/* Vendon Synchronization für Admins */}
        <Route path="/admin/vendon-sync" component={props => (
          <AdminRoute>
            <VendonSync {...props} />
          </AdminRoute>
        )} />

        {/* Supplier Portal Route entfernt - bereits oben registriert */}

        <Route path="/:rest*" component={(props: any) => {
          const rest = props.params?.rest;
          return <NotFound title="Seite nicht gefunden" message={`Der Pfad /${Array.isArray(rest) ? rest.join('/') : rest || ''} existiert nicht.`} />;
        }} />
      </Switch>
    </Layout>
  );
}

// Importiere PublicRoute Wrapper
import PublicRoute from "@/pages/PublicRoute";

function PublicRouter() {
  // Beim Rendern überprüfen wir die aktuelle URL 
  const [location] = useLocation();
  
  // DEBUG: Log public router usage
  console.log('[APP-ROUTER] PublicRouter rendered:', { location });

  return (
    <Switch>
      {/* Login-Seite zeigt stattdessen direkt das Dashboard mit Login-Formular */}
      <Route path="/login">
        {() => <Dashboard />}
      </Route>
      <Route path="/register" component={() => <PublicRoute component={Register} />} />
      <Route path="/">
        <Redirect to="/login" />
      </Route>
    </Switch>
  );
}

// ErrorBoundary importieren
import ErrorBoundary from "@/components/ErrorBoundary";

// Haupt-App-Komponente
function App() {
  console.log('[APP] App component rendered');
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <InventoryCartProvider>
            <MainRouter />
            <Toaster />
          </InventoryCartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

// Haupt-Router, der zwischen authentifizierten und öffentlichen Routen entscheidet
function MainRouter() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const [location] = useLocation();
  
  // DEBUG: Erweiterte Router-Diagnose
  console.log('[APP-ROUTER] MainRouter decisions:', { 
    location, 
    isAuthenticated, 
    isLoading, 
    user: user?.email,
    isPortalRoute: location.includes('/lieferant/') 
  });

  // Hier entfernen wir die automatische Weiterleitung, um mehrfache Weiterleitungen zu vermeiden
  // Die Navigation wird durch den Router basierend auf isAuthenticated gesteuert

  // Während des Ladens zeigen wir einen Ladebildschirm an
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <div className="text-xl font-semibold">Wird geladen...</div>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedRouter /> : <PublicRouter />;
}

export default App;