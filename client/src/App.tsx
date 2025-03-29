import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
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
import AppShell from "@/components/layout/AppShell";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/machines" component={Machines} />
      <Route path="/products" component={Products} />
      <Route path="/synchronization" component={Synchronization} />
      <Route path="/sync-history" component={SyncHistory} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Router />
      </AppShell>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
