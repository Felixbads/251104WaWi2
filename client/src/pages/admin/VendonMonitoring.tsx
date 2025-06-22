import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import VendonSync from './VendonSync';
import ResilientVendonSync from './ResilientVendonSync';
import { 
  Activity, 
  Database, 
  RefreshCw, 
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp
} from 'lucide-react';

const VendonMonitoring: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Kombinierter Status beider Sync-Systeme
  const { data: combinedStatus, isLoading, refetch } = useQuery({
    queryKey: ['/api/vendon-monitoring/combined-status'],
    queryFn: async () => {
      const [syncStatus, resilientStatus] = await Promise.all([
        apiRequest('get', '/api/sync/status').catch(() => null),
        apiRequest('get', '/api/resilient-sync/status').catch(() => null)
      ]);
      
      return {
        traditional: syncStatus,
        resilient: resilientStatus
      };
    },
    refetchInterval: 15000, // Alle 15 Sekunden
  });

  const getOverallHealth = () => {
    if (!combinedStatus) return 'offline';
    
    const traditionalHealth = combinedStatus.traditional?.overall?.status || 'offline';
    const resilientHealth = combinedStatus.resilient?.backgroundService?.overall || 'offline';
    
    if (traditionalHealth === 'healthy' && resilientHealth === 'healthy') {
      return 'healthy';
    } else if (traditionalHealth === 'critical' || resilientHealth === 'critical') {
      return 'critical';
    } else if (traditionalHealth === 'warning' || resilientHealth === 'degraded') {
      return 'warning';
    }
    return 'offline';
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50';
      case 'warning': 
      case 'degraded': return 'text-yellow-600 bg-yellow-50';
      case 'critical':
      case 'error': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="w-5 h-5" />;
      case 'warning': 
      case 'degraded': return <AlertTriangle className="w-5 h-5" />;
      case 'critical':
      case 'error': return <AlertTriangle className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-8 h-8 animate-spin mr-2" />
        <span>Lade Monitoring-Daten...</span>
      </div>
    );
  }

  const overallHealth = getOverallHealth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendon-Synchronisation Monitoring</h1>
          <p className="text-muted-foreground">
            Überwachung und Kontrolle aller Vendon-Synchronisationssysteme
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Gesamtstatus-Übersicht */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getHealthIcon(overallHealth)}
            Gesamtstatus
            <Badge className={getHealthColor(overallHealth)}>
              {overallHealth.toUpperCase()}
            </Badge>
          </CardTitle>
          <CardDescription>
            Kombinierter Status aller Vendon-Synchronisationssysteme
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Traditionelles System */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Traditionelle Synchronisation
              </h3>
              {combinedStatus?.traditional ? (
                <div className="space-y-1">
                  <Badge className={getHealthColor(combinedStatus.traditional.overall?.status || 'offline')}>
                    {combinedStatus.traditional.overall?.status?.toUpperCase() || 'OFFLINE'}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Letzte Aktualisierung: {combinedStatus.traditional.overall?.lastUpdated ? 
                      new Date(combinedStatus.traditional.overall.lastUpdated).toLocaleString() : 'Unbekannt'}
                  </p>
                  <p className="text-sm">
                    {combinedStatus.traditional.transactions?.totalTransactions?.toLocaleString() || 0} Transaktionen gesamt
                  </p>
                </div>
              ) : (
                <Badge variant="secondary">System nicht verfügbar</Badge>
              )}
            </div>

            {/* Resilientes System */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Resiliente Synchronisation
              </h3>
              {combinedStatus?.resilient ? (
                <div className="space-y-1">
                  <Badge className={getHealthColor(combinedStatus.resilient.backgroundService?.overall || 'offline')}>
                    {combinedStatus.resilient.backgroundService?.overall?.toUpperCase() || 'OFFLINE'}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {combinedStatus.resilient.isRunning ? 'Läuft aktiv' : 'Gestoppt'}
                  </p>
                  <p className="text-sm">
                    {combinedStatus.resilient.backgroundService?.stats?.successfulSyncs || 0} erfolgreiche Syncs
                  </p>
                </div>
              ) : (
                <Badge variant="secondary">System nicht verfügbar</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistiken */}
      {combinedStatus && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt-Transaktionen</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(combinedStatus.traditional?.transactions?.totalTransactions || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Letzte 24h: {combinedStatus.traditional?.transactions?.recentCount || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sync-Erfolgsrate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {combinedStatus.resilient?.backgroundService?.stats ? 
                  Math.round((combinedStatus.resilient.backgroundService.stats.successfulSyncs / 
                    Math.max(combinedStatus.resilient.backgroundService.stats.totalSyncs, 1)) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {combinedStatus.resilient?.backgroundService?.stats?.totalSyncs || 0} Syncs gesamt
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Datenlücken</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {combinedStatus.traditional?.recovery?.totalGaps || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {combinedStatus.resilient?.backgroundService?.stats?.dataGapsResolved || 0} geschlossen
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System-Uptime</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {combinedStatus.resilient?.backgroundService?.uptime ? 
                  Math.floor(combinedStatus.resilient.backgroundService.uptime / 3600) : 0}h
              </div>
              <p className="text-xs text-muted-foreground">
                Kontinuierlich aktiv
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detaillierte Kontrollen */}
      <Tabs defaultValue="resilient" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="resilient">Resiliente Synchronisation</TabsTrigger>
          <TabsTrigger value="traditional">Traditionelle Synchronisation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="resilient" className="space-y-4">
          <ResilientVendonSync />
        </TabsContent>
        
        <TabsContent value="traditional" className="space-y-4">
          <VendonSync />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VendonMonitoring;