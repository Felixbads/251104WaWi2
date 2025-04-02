import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tab, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Server, BarChart4, Clock, Database, RefreshCcw, Download } from 'lucide-react';
import axios from 'axios';

import TransactionSyncTab from '@/components/sync/TransactionSyncTab';
import MachinesSyncTab from '@/components/sync/MachinesSyncTab';
import ProductsSyncTab from '@/components/sync/ProductsSyncTab';
import RefillsSyncTab from '@/components/sync/RefillsSyncTab';
import SyncSettings from '@/components/sync/SyncSettings';
import SyncLogs from '@/components/sync/SyncLogs';
import BulkSyncTab from '@/components/sync/BulkSyncTab';

export default function SyncPage() {
  const [activeTab, setActiveTab] = useState('transactions');
  
  // Hole Synchronisierungsstatus
  const syncStatusQuery = useQuery({
    queryKey: ['/api/sync/status'],
    queryFn: async () => {
      const response = await axios.get('/api/sync/status');
      return response.data;
    },
    refetchInterval: 30000  // Aktualisiere alle 30 Sekunden
  });

  // Hole Datenbankstatistiken
  const databaseStatsQuery = useQuery({
    queryKey: ['/api/database/stats'],
    queryFn: async () => {
      const response = await axios.get('/api/database/stats');
      return response.data;
    },
    refetchInterval: 60000  // Aktualisiere jede Minute
  });

  const getStatusBadgeClass = (status) => {
    switch(status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Nie';
    try {
      const date = new Date(dateString);
      return format(date, 'PPpp', { locale: de });
    } catch (error) {
      return dateString;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Daten-Synchronisation</h1>
        <p className="text-muted-foreground">
          Hier können Sie Transaktions- und Stammdaten von der Vendon-API abrufen und verwalten.
        </p>
      </header>

      {/* Status-Übersicht */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Automaten */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Automaten</p>
                <p className="text-2xl font-bold">
                  {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.machines || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Server className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-xs">
              <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClass(syncStatusQuery.data?.machines?.status)}`}>
                {syncStatusQuery.data?.machines?.status === 'completed' ? 'Synchronisiert' : 
                 syncStatusQuery.data?.machines?.status === 'running' ? 'Läuft...' : 
                 syncStatusQuery.data?.machines?.status === 'pending' ? 'Anstehend' : 
                 syncStatusQuery.data?.machines?.status === 'error' ? 'Fehler' : 'Unbekannt'}
              </span>
              <span className="ml-2 text-muted-foreground">
                Letzte Aktualisierung: {formatDate(syncStatusQuery.data?.machines?.lastSync)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Produkte */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Produkte</p>
                <p className="text-2xl font-bold">
                  {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.products || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Database className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-xs">
              <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClass(syncStatusQuery.data?.products?.status)}`}>
                {syncStatusQuery.data?.products?.status === 'completed' ? 'Synchronisiert' : 
                 syncStatusQuery.data?.products?.status === 'running' ? 'Läuft...' : 
                 syncStatusQuery.data?.products?.status === 'pending' ? 'Anstehend' : 
                 syncStatusQuery.data?.products?.status === 'error' ? 'Fehler' : 'Unbekannt'}
              </span>
              <span className="ml-2 text-muted-foreground">
                Letzte Aktualisierung: {formatDate(syncStatusQuery.data?.products?.lastSync)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Transaktionen */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Transaktionen</p>
                <p className="text-2xl font-bold">
                  {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.transactions?.toLocaleString('de-DE') || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart4 className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-xs">
              <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClass(syncStatusQuery.data?.transactions?.status)}`}>
                {syncStatusQuery.data?.transactions?.status === 'completed' ? 'Synchronisiert' : 
                 syncStatusQuery.data?.transactions?.status === 'running' ? 'Läuft...' : 
                 syncStatusQuery.data?.transactions?.status === 'pending' ? 'Anstehend' : 
                 syncStatusQuery.data?.transactions?.status === 'error' ? 'Fehler' : 'Unbekannt'}
              </span>
              <span className="ml-2 text-muted-foreground">
                Letzte Aktualisierung: {formatDate(syncStatusQuery.data?.transactions?.lastSync)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Auffüllungen */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Auffüllungen</p>
                <p className="text-2xl font-bold">
                  {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.refills || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <RefreshCcw className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-xs">
              <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClass(syncStatusQuery.data?.refills?.status)}`}>
                {syncStatusQuery.data?.refills?.status === 'completed' ? 'Synchronisiert' : 
                 syncStatusQuery.data?.refills?.status === 'running' ? 'Läuft...' : 
                 syncStatusQuery.data?.refills?.status === 'pending' ? 'Anstehend' : 
                 syncStatusQuery.data?.refills?.status === 'error' ? 'Fehler' : 'Unbekannt'}
              </span>
              <span className="ml-2 text-muted-foreground">
                Letzte Aktualisierung: {formatDate(syncStatusQuery.data?.refills?.lastSync)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs für die verschiedenen Synchronisationen */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-6 mb-4">
          <TabsTrigger value="transactions">Transaktionen</TabsTrigger>
          <TabsTrigger value="bulk">Bulk-Sync</TabsTrigger>
          <TabsTrigger value="machines">Automaten</TabsTrigger>
          <TabsTrigger value="products">Produkte</TabsTrigger>
          <TabsTrigger value="refills">Auffüllungen</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <TransactionSyncTab />
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4">
          <BulkSyncTab />
        </TabsContent>

        <TabsContent value="machines" className="space-y-4">
          <MachinesSyncTab />
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <ProductsSyncTab />
        </TabsContent>

        <TabsContent value="refills" className="space-y-4">
          <RefillsSyncTab />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <SyncLogs />
        </TabsContent>
      </Tabs>
    </div>
  );
}