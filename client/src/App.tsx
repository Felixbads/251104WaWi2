import React from 'react';
import { Router, Route, Switch } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';

// Import pages
import Dashboard from '@/pages/Dashboard';
import Orders from '@/pages/Orders';
import BestellungV2 from '@/pages/BestellungV2';
import EnhancedOrderProcess from '@/pages/EnhancedOrderProcess';
import Products from '@/pages/Products';
import Suppliers from '@/pages/Suppliers';
import Warehouses from '@/pages/Warehouses';
import Machines from '@/pages/Machines';
import Transactions from '@/pages/Transactions';
import NotFound from '@/pages/NotFound';

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-background">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            
            {/* Order routes */}
            <Route path="/bestellungen" component={Orders} />
            <Route path="/bestellungen/neu-v2" component={BestellungV2} />
            <Route path="/bestellungen/neu-enhanced" component={EnhancedOrderProcess} />
            
            {/* Other routes */}
            <Route path="/produkte" component={Products} />
            <Route path="/lieferanten" component={Suppliers} />
            <Route path="/lager" component={Warehouses} />
            <Route path="/automaten" component={Machines} />
            <Route path="/transaktionen" component={Transactions} />
            
            {/* 404 fallback */}
            <Route component={NotFound} />
          </Switch>
        </div>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;