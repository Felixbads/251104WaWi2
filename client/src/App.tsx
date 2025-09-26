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
import AutomatenNew from "@/pages/AutomatenNew"; // Neueste Automaten-Übersicht
import StandortStatus from "@/pages/StandortStatus"; // Standort-Status-Übersicht
import StandortAnalyse from "@/pages/StandortAnalyse"; // Standort-Analyse mit Verkäufen vs. Entnahmen
import AutomatDetail from "@/pages/AutomatDetail"; // Detail-Ansicht eines Automaten
import RefillDetail from "@/pages/RefillDetail"; // Detail-Ansicht einer Auffüllung
import Products from "@/pages/Products";
import ProductsNew from "@/pages/ProductsNew";
import ProductDetail from "@/pages/ProductDetail"; // Detail-Ansicht eines Produkts
import ProductDataEntry from "@/pages/ProductDataEntry"; // Tabellarische Produktdatenbearbeitung
import WarenbewegungNewPage from "@/pages/WarenbewegungNewPage"; // Neue Warenumlagerung-Komponente
import SyncDashboard from "@/pages/SyncDashboard";
import SyncHistory from "@/pages/SyncHistory";
import Settings from "@/pages/Settings";
import MailSettings from "@/pages/MailSettings"; // Neue Email-Einstellungen-Seite
import DailyEmailSettings from "@/pages/DailyEmailSettings"; // Tägliche E-Mail-Benachrichtigungen
import MailBenachrichtigungPage from "@/pages/MailBenachrichtigungPage"; // Zentrale Mail-Benachrichtigung
import Forecast from "@/pages/Forecast";
import ForecastEvaluation from "@/pages/ForecastEvaluation";
import ForecastDetail from "@/pages/ForecastDetail";
import EnhancedForecastDashboard from "@/pages/EnhancedForecastDashboard";
import DataAvailability from "@/pages/DataAvailability"; // Neue Datenverfügbarkeits-Komponente
import AdvancedAnalysis from "@/pages/AdvancedAnalysis"; // Erweiterte Analyse-Komponente
import ProfitabilityAnalysis from "@/pages/ProfitabilityAnalysis"; // Wirtschaftlichkeitsauswertung
import Wirtschaftlichkeit from "@/pages/Wirtschaftlichkeit"; // Neue Wirtschaftlichkeitsseite
import ModernProfitabilityDashboard from "@/pages/ModernProfitabilityDashboard"; // Modernes Wirtschaftlichkeits-Dashboard
import ProductProfitabilityAnalysis from "@/pages/ProductProfitabilityAnalysis"; // Produktspezifische Wirtschaftlichkeitsanalyse
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import NotApproved from "@/pages/NotApproved"; // Seite für nicht-freigegebene Benutzer
import Unauthorized from "@/pages/Unauthorized"; // Seite für nicht-autorisierte Benutzer
import AdminUsers from "@/pages/AdminUsers"; // Admin-Benutzerverwaltung
import AppShell from "@/components/layout/AppShell";
import Layout from "@/components/layout/Layout";
import { AuthProvider, useAuth } from "@/lib";
import AdminRoute from "@/components/auth/AdminRoute"; // Route nur für Admins
import ApprovedUserRoute from "@/components/auth/ApprovedUserRoute"; // Route für genehmigte Benutzer
import { InventoryCartProvider } from "@/components/inventory/InventoryCartContext";
import InterAppConnections from "@/pages/InterAppConnections";
import SupplierPortal from "@/pages/SupplierPortal";
import SupplierPortalNew from "@/pages/SupplierPortalNew";
import UmsatzErgebnisUebersicht from "@/pages/UmsatzErgebnisUebersicht";
import BatchManagement from "@/pages/BatchManagement";

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
import RetroactiveInventory from "@/pages/RetroactiveInventory";
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
import WarehouseDetailV3 from "@/pages/Warehouse3/WarehouseDetail";
import WarehouseMovements from "@/pages/WarehouseMovements";
import WarenentnahmePage from "@/pages/WarenentnahmePage";
import WarenentnahmeDetail from "@/pages/WarenentnahmeDetail";
import WarenentnahmeNew from "@/pages/WarenentnahmeNew";
import InventoryMovementNew from "@/pages/InventoryMovementNew";
import UserManagement from "@/pages/UserManagement";
import InventurPage from "@/pages/InventurPage";
import InventurDetailPage from "@/pages/InventurDetailPage";
import InventurDetailNewPage from "@/pages/InventurDetailNewPage";
import InventurDetailSimplePage from "@/pages/InventurDetailSimplePage";
import InventurCreationPage from "@/pages/InventurCreationPage";
import RefillTrackingPage from "@/pages/RefillTrackingPage";
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
import RuecklauferDetails from "@/pages/RuecklauferDetails";
import RevenueExpectations from "@/pages/RevenueExpectations";
import OrdersOverviewPage from "@/pages/OrdersOverviewPage";
import SupportTicket from "@/pages/SupportTicket";
import VendonSync from "@/pages/admin/VendonSync";
import VendonSyncDashboard from "@/pages/admin/VendonSyncDashboard";
import Notifications from "@/pages/System/Notifications";
import RecurringOrdersPage from "@/pages/RecurringOrdersPage";
import Fuellstaende from "@/pages/Fuellstaende";
import LocationDetail from "@/pages/LocationDetail";
import PagePermissions from "@/pages/PagePermissions";
import DBIndex from "@/pages/DBIndex";
import RefillVorlagen from "@/pages/RefillVorlagen";
import LagerV2 from "@/pages/LagerV2";
import NavigationAuditDashboard from "@/pages/NavigationAuditDashboard"; // Navigation Audit System Dashboard
import { warehouseRoutes, buildWarehousePath } from "@/lib/warehouseRoutes";

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
        
        {/* Lieferanten-Portal Route entfernt - wird direkt im MainRouter gehandhabt */}

        {/* Geschützte Routen, die Freigabe erfordern */}
        <Route path="/dashboard">
          {() => (
            <ApprovedUserRoute>
              <Dashboard />
            </ApprovedUserRoute>
          )}
        </Route>

        <Route path="/navigation-audit-dashboard">
          {() => (
            <ApprovedUserRoute>
              <NavigationAuditDashboard />
            </ApprovedUserRoute>
          )}
        </Route>

        <Route path="/">
          <Redirect to="/dashboard" />
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

        <Route path="/machines">
          <ApprovedUserRoute>
            <Machines />
          </ApprovedUserRoute>
        </Route>

        <Route path="/automaten">
          <ApprovedUserRoute>
            <Automaten />
          </ApprovedUserRoute>
        </Route>

        <Route path="/automaten2">
          <ApprovedUserRoute>
            <Automaten2 />
          </ApprovedUserRoute>
        </Route>

        <Route path="/automaten-new">
          <ApprovedUserRoute>
            <AutomatenNew />
          </ApprovedUserRoute>
        </Route>

        <Route path="/standort-status">
          <ApprovedUserRoute>
            <StandortStatus />
          </ApprovedUserRoute>
        </Route>

        <Route path="/standort-analyse">
          <ApprovedUserRoute>
            <StandortAnalyse />
          </ApprovedUserRoute>
        </Route>

        <Route path="/automaten/:id">
          {(params) => (
            <ApprovedUserRoute>
              <AutomatDetail />
            </ApprovedUserRoute>
          )}
        </Route>

        <Route path="/db-index">
          <ApprovedUserRoute>
            <DBIndex />
          </ApprovedUserRoute>
        </Route>



        <Route path="/automaten/:id/refills/:refillId">
          <ApprovedUserRoute>
            <RefillDetail />
          </ApprovedUserRoute>
        </Route>

        <Route path="/produkte">
          <ApprovedUserRoute>
            <ProductsNew />
          </ApprovedUserRoute>
        </Route>

        <Route path="/produkte/neu">
          <ApprovedUserRoute>
            <ProductDetail />
          </ApprovedUserRoute>
        </Route>

        <Route path="/produkte/bearbeiten">
          <ApprovedUserRoute>
            <ProductDataEntry />
          </ApprovedUserRoute>
        </Route>

        <Route path="/product-data-entry">
          <ApprovedUserRoute>
            <ProductDataEntry />
          </ApprovedUserRoute>
        </Route>

        <Route path="/produkte/:id">
          <ApprovedUserRoute>
            <ProductDetail />
          </ApprovedUserRoute>
        </Route>

        <Route path="/lieferanten">
          <ApprovedUserRoute>
            <SuppliersFast />
          </ApprovedUserRoute>
        </Route>

        <Route path="/retroaktive-inventur">
          <ApprovedUserRoute>
            <RetroactiveInventory />
          </ApprovedUserRoute>
        </Route>

        <Route path="/lieferanten/:id">
          <ApprovedUserRoute>
            <SupplierDetail />
          </ApprovedUserRoute>
        </Route>

        <Route path="/lieferanten-planung">
          <ApprovedUserRoute>
            <OrderDeliveryOverview />
          </ApprovedUserRoute>
        </Route>

        {/* Spezifische Routen MÜSSEN vor dynamischen Routen stehen */}
        {/* BestellungenV4 temporarily disabled */}

        <Route path="/bestellungen/neu-v2">
          <ApprovedUserRoute>
            <BestellungV2 />
          </ApprovedUserRoute>
        </Route>

        {/* Bestellungen Overview - Main orders list page */}
        <Route path="/bestellungen">
          <ApprovedUserRoute>
            <OrdersOverviewPage />
          </ApprovedUserRoute>
        </Route>

        {/* Bestellungen Workflow - Dynamic order workflow */}
        <Route path="/bestellungen/workflow">
          <ApprovedUserRoute>
            <BestellungV2 />
          </ApprovedUserRoute>
        </Route>

        {/* Neue Bestellungen - Order creation process */}
        <Route path="/bestellungen/neu">
          <ApprovedUserRoute>
            <BestellungV2 />
          </ApprovedUserRoute>
        </Route>

        {/* Enhanced ordering process with smart cart and forecasting */}
        <Route path="/bestellungen/enhanced">
          <ApprovedUserRoute>
            <EnhancedOrdering />
          </ApprovedUserRoute>
        </Route>

        {/* Wiederkehrende Bestellungen mit Automatisierung und Prognose */}
        <Route path="/wiederkehrende-bestellungen">
          <ApprovedUserRoute>
            <RecurringOrdersPage />
          </ApprovedUserRoute>
        </Route>

        <Route path="/bestellungen/:id">
          <ApprovedUserRoute>
            <OrderDetail />
          </ApprovedUserRoute>
        </Route>

        {/* Legacy Wareneingang Route - Redirect to new BestellungV2 workflow */}
        <Route path="/bestellungen/:id/wareneingang">
          {({ id }) => <Redirect to={`/bestellungen/neu?step=warehouseReceiptOfExistingOrder&orderId=${id}`} />}
        </Route>

        {/* Removed static supplier portal route - use token-based access only */}


        <Route path="/lager-neu">
          <ApprovedUserRoute>
            <LagerNew />
          </ApprovedUserRoute>
        </Route>

        <Route path="/lagerhaltung">
          <ApprovedUserRoute>
            <Lagerhaltung />
          </ApprovedUserRoute>
        </Route>

        <Route path="/inventory">
          <ApprovedUserRoute>
            <Inventory />
          </ApprovedUserRoute>
        </Route>

        <Route path="/inventory/movements/new">
          <ApprovedUserRoute>
            <InventoryMovementNew />
          </ApprovedUserRoute>
        </Route>

        <Route path="/warehouses/:id">
          <ApprovedUserRoute>
            <WarehouseDetail />
          </ApprovedUserRoute>
        </Route>

        <Route path="/warehouse/:id">
          <ApprovedUserRoute>
            <WarehouseDetailPage />
          </ApprovedUserRoute>
        </Route>

        <Route path="/lager">
          <ApprovedUserRoute>
            <LagerV2 />
          </ApprovedUserRoute>
        </Route>

        {/* WAREHOUSE V3 DETAIL ROUTE */}
        <Route path="/lager/:id">
          <ApprovedUserRoute>
            <WarehouseDetailV3 />
          </ApprovedUserRoute>
        </Route>

        <Route path="/lagerbestand-neu">
          <ApprovedUserRoute>
            <LagerbestandPage />
          </ApprovedUserRoute>
        </Route>

        <Route path="/kritische-bestaende">
          <ApprovedUserRoute>
            <CriticalInventory />
          </ApprovedUserRoute>
        </Route>

        <Route path="/chargenverwaltung">
          <ApprovedUserRoute>
            <BatchManagement />
          </ApprovedUserRoute>
        </Route>

        <Route path="/ruecklaufer/details/:productName">
          <ApprovedUserRoute>
            <RuecklauferDetails />
          </ApprovedUserRoute>
        </Route>
        
        <Route path="/ruecklaufer">
          <ApprovedUserRoute>
            <Ruecklaufer />
          </ApprovedUserRoute>
        </Route>

        {/* LEGACY REDIRECTS - Alte Lagerbestand-Routen zu neuer V3 weiterleiten */}
        <Route path="/lagerbestand">
          <Redirect to={warehouseRoutes.dashboard} />
        </Route>

        <Route path="/lagerbestand/:id">
          {(params) => <Redirect to={buildWarehousePath(params.id)} />}
        </Route>

        <Route path="/warehouses/:id/warenbewegung">
          <ApprovedUserRoute>
            <WarehouseMovements />
          </ApprovedUserRoute>
        </Route>

        {/* Warenbewegung (Warenumlagerung) Route */}
        <Route path="/warenbewegung">
          <ApprovedUserRoute>
            <WarenbewegungNewPage />
          </ApprovedUserRoute>
        </Route>
        {/* Alte Routen auskommentiert (können später entfernt werden) */}
        <Route path="/warenentnahme">
          <ApprovedUserRoute>
            <WarenentnahmePage />
          </ApprovedUserRoute>
        </Route>
        <Route path="/warenentnahme/new">
          <ApprovedUserRoute>
            <WarenentnahmeNew />
          </ApprovedUserRoute>
        </Route>
        <Route path="/warenentnahme/:id">
          <ApprovedUserRoute>
            <WarenentnahmeDetail />
          </ApprovedUserRoute>
        </Route>

        {/* Refill-Tracking Route */}
        <Route path="/refill-tracking">
          <ApprovedUserRoute>
            <RefillTrackingPage />
          </ApprovedUserRoute>
        </Route>

        {/* Refill-Vorlagen Route */}
        <Route path="/refill-vorlagen">
          <ApprovedUserRoute>
            <RefillVorlagen />
          </ApprovedUserRoute>
        </Route>

        {/* Inventur-Seiten */}
        <Route path="/inventur">
          <ApprovedUserRoute>
            <InventurPage />
          </ApprovedUserRoute>
        </Route>

        {/* Englische Route für Inventory Counts → Inventur umleiten */}
        <Route path="/inventory-counts">
          <ApprovedUserRoute>
            <InventurPage />
          </ApprovedUserRoute>
        </Route>

        <Route path="/inventur/neu">
          <ApprovedUserRoute>
            <InventurCreationPage />
          </ApprovedUserRoute>
        </Route>

        {/* Inventur-Detailseite */}
        <Route path="/inventur/:id">
          {(params) => (
            <ApprovedUserRoute>
              <InventurDetailSimplePage params={params} />
            </ApprovedUserRoute>
          )}
        </Route>
        
        <Route path="/inventur/:id/complex">
          {(params) => (
            <ApprovedUserRoute>
              <InventurDetailNewPage params={params} />
            </ApprovedUserRoute>
          )}
        </Route>

        {/* Neue verbesserte Inventur-Detailseite - VEREINFACHT! */}
        <Route path="/inventur-detail/:id">
          {(params) => (
            <ApprovedUserRoute>
              <InventurDetailSimplePage params={params} />
            </ApprovedUserRoute>
          )}
        </Route>

        {/* Nur Admin kann die Auswertungsseite sehen */}
        <Route path="/auswertungen">
          <AdminRoute>
            <Reporting />
          </AdminRoute>
        </Route>

        <Route path="/erweiterte-analyse">
          <AdminRoute>
            <AdvancedAnalysis />
          </AdminRoute>
        </Route>

        <Route path="/auswertungen-old">
          <ApprovedUserRoute>
            <ProfitabilityAnalysis />
          </ApprovedUserRoute>
        </Route>

        <Route path="/wirtschaftlichkeit">
          <ApprovedUserRoute>
            <Wirtschaftlichkeit />
          </ApprovedUserRoute>
        </Route>

        <Route path="/wirtschaftlichkeit-modern">
          <ApprovedUserRoute>
            <ModernProfitabilityDashboard />
          </ApprovedUserRoute>
        </Route>

        <Route path="/umsatz-ergebnis-uebersicht">
          <ApprovedUserRoute>
            <UmsatzErgebnisUebersicht />
          </ApprovedUserRoute>
        </Route>

        <Route path="/wirtschaftlichkeit-alt">
          <ApprovedUserRoute>
            <ProfitabilityAnalysis />
          </ApprovedUserRoute>
        </Route>

        <Route path="/produkte/:id/wirtschaftlichkeit">
          <ApprovedUserRoute>
            <ProductProfitabilityAnalysis />
          </ApprovedUserRoute>
        </Route>

        <Route path="/datenverfuegbarkeit">
          <ApprovedUserRoute>
            <DataAvailability />
          </ApprovedUserRoute>
        </Route>

        <Route path="/support">
          <ApprovedUserRoute>
            <SupportTicket />
          </ApprovedUserRoute>
        </Route>

        <Route path="/datenverfuegbarkeit/wetter">
          <ApprovedUserRoute>
            <WeatherDataOverview />
          </ApprovedUserRoute>
        </Route>

        <Route path="/datenverfuegbarkeit/wetter-visualisierung">
          <ApprovedUserRoute>
            <WeatherVisualization />
          </ApprovedUserRoute>
        </Route>

        <Route path="/datenverfuegbarkeit/feiertage">
          <ApprovedUserRoute>
            <HolidaysVacationsOverview />
          </ApprovedUserRoute>
        </Route>

        <Route path="/feiertage-analyse">
          <ApprovedUserRoute>
            <HolidayAnalysisDashboard />
          </ApprovedUserRoute>
        </Route>

        <Route path="/synchronization">
          <ApprovedUserRoute>
            <SyncDashboard />
          </ApprovedUserRoute>
        </Route>

        <Route path="/sync-history">
          <ApprovedUserRoute>
            <SyncHistory />
          </ApprovedUserRoute>
        </Route>

        <Route path="/sync">
          <ApprovedUserRoute>
            <SyncDashboard />
          </ApprovedUserRoute>
        </Route>

        <Route path="/forecast">
          <ApprovedUserRoute>
            <Forecast />
          </ApprovedUserRoute>
        </Route>

        <Route path="/forecast-evaluation">
          <ApprovedUserRoute>
            <ForecastEvaluation />
          </ApprovedUserRoute>
        </Route>
        
        <Route path="/forecast-detail">
          <ApprovedUserRoute>
            <ForecastDetail />
          </ApprovedUserRoute>
        </Route>

        <Route path="/enhanced-forecast">
          <ApprovedUserRoute>
            <EnhancedForecastDashboard />
          </ApprovedUserRoute>
        </Route>

        <Route path="/product-forecasts">
          <ApprovedUserRoute>
            <ProductForecastPage />
          </ApprovedUserRoute>
        </Route>

        <Route path="/revenue-expectations">
          <ApprovedUserRoute>
            <RevenueExpectations />
          </ApprovedUserRoute>
        </Route>

        <Route path="/fuellstaende">
          <ApprovedUserRoute>
            <Fuellstaende />
          </ApprovedUserRoute>
        </Route>

        <Route path="/settings">
          <ApprovedUserRoute>
            <Settings />
          </ApprovedUserRoute>
        </Route>

        <Route path="/email-einstellungen">
          <ApprovedUserRoute>
            <MailSettings />
          </ApprovedUserRoute>
        </Route>

        <Route path="/taegliche-email-einstellungen">
          <ApprovedUserRoute>
            <DailyEmailSettings />
          </ApprovedUserRoute>
        </Route>

        {/* Zentrale Mail-Benachrichtigungen */}
        <Route path="/system/mail-benachrichtigung">
          <ApprovedUserRoute>
            <MailBenachrichtigungPage />
          </ApprovedUserRoute>
        </Route>

        {/* Nachhaltigkeits-Tracker */}
        <Route path="/nachhaltigkeit">
          <ApprovedUserRoute>
            <SustainableVending />
          </ApprovedUserRoute>
        </Route>

        {/* Datenbank-Manager für Admins */}
        <Route path="/database-manager">
          <AdminRoute>
            <DatabaseManager />
          </AdminRoute>
        </Route>

        {/* Benutzer-Verwaltung für Admins */}
        <Route path="/benutzer">
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        </Route>

        {/* Admin-Benutzerverwaltung für Admins */}
        <Route path="/admin/benutzer">
          {() => (
            <AdminRoute>
              <AdminUsers />
            </AdminRoute>
          )}
        </Route>

        {/* Inter-App Verbindungen für Admins */}
        <Route path="/inter-app-verbindungen">
          <AdminRoute>
            <InterAppConnections />
          </AdminRoute>
        </Route>

        {/* Vendon Synchronization für Admins */}
        <Route path="/admin/vendon-sync">
          <AdminRoute>
            <VendonSync />
          </AdminRoute>
        </Route>

        {/* Vendon Sync Dashboard für Admins */}
        <Route path="/admin/vendon-sync-dashboard">
          <AdminRoute>
            <VendonSyncDashboard />
          </AdminRoute>
        </Route>

        {/* Seitenfreigabe für Admins */}
        <Route path="/seitenfreigabe">
          <AdminRoute>
            <PagePermissions />
          </AdminRoute>
        </Route>

        {/* Benachrichtigungssystem für Admins */}
        <Route path="/system/benachrichtigungen">
          <AdminRoute>
            <Notifications />
          </AdminRoute>
        </Route>

        {/* Umsatz- und Ergebnisübersicht */}
        <Route path="/umsatz-ergebnis-uebersicht">
          <ApprovedUserRoute>
            <UmsatzErgebnisUebersicht />
          </ApprovedUserRoute>
        </Route>

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

  // VEREINFACHTE PORTAL-ROUTEN: Nur Token-basierter Zugang
  if (location.includes('/lieferant/')) {
    console.log('[MAIN-ROUTER] PORTAL ROUTE DETECTED - Centralized rendering');
    console.log('[MAIN-ROUTER] Location:', location);
    
    // Extrahiere Access-Token aus URL (erstes Segment nach /lieferant/)
    const tokenMatch = location.match(/\/lieferant\/([^\/]+)/);
    
    if (tokenMatch) {
      const [, accessToken] = tokenMatch;
      console.log('[MAIN-ROUTER] Access Token extracted:', accessToken.substring(0, 10) + '...');
      
      // Verwende nur SupplierPortalNew für alle Portal-Zugriffe
      return (
        <QueryClientProvider client={queryClient}>
          <SupplierPortalNew accessToken={accessToken} />
          <Toaster />
        </QueryClientProvider>
      );
    } else {
      console.error('[MAIN-ROUTER] No access token found in URL');
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4 text-red-600">Ungültiger Portal-Link</h2>
            <p className="text-gray-600">Der Portal-Link ist ungültig oder fehlerhaft.</p>
            <p className="text-gray-600">Bitte kontaktieren Sie unser Team für Unterstützung.</p>
          </div>
        </div>
      );
    }
  }

  return isAuthenticated ? <AuthenticatedRouter /> : <PublicRouter />;
}

export default App;