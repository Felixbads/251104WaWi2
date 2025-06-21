import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, RefreshCw, AlertTriangle, CheckCircle, Database, Zap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface SyncStatus {
  machines: {
    status: string;
    lastSync: string;
    totalTransactions: number;
  };
  transactions: {
    status: string;
    lastSync: string;
    recentCount: number;
    totalCount: number;
    dateRange: {
      earliest: string;
      latest: string;
      daysWithData: number;
    };
  };
  recovery: {
    totalGaps: number;
    mostRecentGap: string | null;
    gapDetails: Array<{
      date: string;
      actualCount: number;
      status: string;
    }>;
  };
  overall: {
    status: string;
    lastUpdated: string;
  };
}

interface SyncResult {
  status: string;
  message: string;
  data?: any;
}

export const VendonSync = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current sync status
  const { data: syncStatus, isLoading, refetch } = useQuery<SyncStatus>({
    queryKey: ['/api/sync/status'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Ultra-robust sync mutation
  const ultraRobustSyncMutation = useMutation({
    mutationFn: () => apiRequest('post', '/api/sync/vendon/ultra-robust'),
    onMutate: () => {
      setIsRunning(true);
      setLastResult(null);
    },
    onSuccess: (result: SyncResult) => {
      setLastResult(result);
      toast({
        title: 'Ultra-Robust Sync Completed',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
    },
    onError: (error: any) => {
      const errorResult: SyncResult = {
        status: 'error',
        message: error.message || 'Ultra-robust sync failed'
      };
      setLastResult(errorResult);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Ultra-robust sync failed',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsRunning(false);
    },
  });

  // Regular sync mutation
  const regularSyncMutation = useMutation({
    mutationFn: (params: any) => apiRequest('post', '/api/sync/vendon/transactions', params),
    onMutate: () => {
      setIsRunning(true);
      setLastResult(null);
    },
    onSuccess: (result: SyncResult) => {
      setLastResult(result);
      toast({
        title: 'Regular Sync Completed',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
    },
    onError: (error: any) => {
      const errorResult: SyncResult = {
        status: 'error',
        message: error.message || 'Regular sync failed'
      };
      setLastResult(errorResult);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Regular sync failed',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsRunning(false);
    },
  });

  // Gap recovery mutation
  const gapRecoveryMutation = useMutation({
    mutationFn: () => apiRequest('post', '/api/sync/vendon/gap-recovery'),
    onMutate: () => {
      setIsRunning(true);
      setLastResult(null);
    },
    onSuccess: (result: SyncResult) => {
      setLastResult(result);
      toast({
        title: 'Gap Recovery Completed',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
    },
    onError: (error: any) => {
      const errorResult: SyncResult = {
        status: 'error',
        message: error.message || 'Gap recovery failed'
      };
      setLastResult(errorResult);
      toast({
        title: 'Gap Recovery Failed',
        description: error.message || 'Gap recovery failed',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsRunning(false);
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'completed':
      case 'active':
        return 'bg-green-500';
      case 'warning':
      case 'stale':
        return 'bg-yellow-500';
      case 'critical':
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'completed':
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
      case 'stale':
        return <AlertTriangle className="w-4 h-4" />;
      case 'critical':
      case 'error':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Database className="w-4 h-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading sync status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendon Synchronization</h1>
          <p className="text-muted-foreground">
            Monitor and control Vendon API transaction synchronization
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Status
        </Button>
      </div>

      {/* Overall Status */}
      {syncStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(syncStatus.overall.status)}
              Overall System Status
              <Badge variant={syncStatus.overall.status === 'healthy' ? 'default' : 'destructive'}>
                {syncStatus.overall.status.toUpperCase()}
              </Badge>
            </CardTitle>
            <CardDescription>
              Last updated: {new Date(syncStatus.overall.lastUpdated).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Machines Status */}
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(syncStatus.machines.status)}`} />
                  Machines
                </h3>
                <p className="text-sm text-muted-foreground">
                  {syncStatus.machines.totalTransactions.toLocaleString()} total transactions
                </p>
                <p className="text-xs text-muted-foreground">
                  Last sync: {syncStatus.machines.lastSync ? 
                    new Date(syncStatus.machines.lastSync).toLocaleString() : 'Never'}
                </p>
              </div>

              {/* Transactions Status */}
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(syncStatus.transactions.status)}`} />
                  Transactions
                </h3>
                <p className="text-sm text-muted-foreground">
                  {syncStatus.transactions.recentCount} in last 24h
                </p>
                <p className="text-xs text-muted-foreground">
                  {syncStatus.transactions.dateRange.daysWithData} days with data
                </p>
              </div>

              {/* Recovery Status */}
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${syncStatus.recovery.totalGaps > 0 ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  Data Gaps
                </h3>
                <p className="text-sm text-muted-foreground">
                  {syncStatus.recovery.totalGaps} gaps found
                </p>
                {syncStatus.recovery.mostRecentGap && (
                  <p className="text-xs text-muted-foreground">
                    Most recent: {new Date(syncStatus.recovery.mostRecentGap).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Ultra-Robust Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Ultra-Robust Sync
            </CardTitle>
            <CardDescription>
              Maximum reliability synchronization that continues from the last transaction and fills all gaps
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => ultraRobustSyncMutation.mutate()}
              disabled={isRunning}
              className="w-full"
            >
              {isRunning && ultraRobustSyncMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Start Ultra-Robust Sync
            </Button>
          </CardContent>
        </Card>

        {/* Regular Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Regular Sync
            </CardTitle>
            <CardDescription>
              Standard synchronization for recent transactions (last 7 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => regularSyncMutation.mutate({ forceUpdate: true })}
              disabled={isRunning}
              variant="outline"
              className="w-full"
            >
              {isRunning && regularSyncMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Start Regular Sync
            </Button>
          </CardContent>
        </Card>

        {/* Gap Recovery */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Gap Recovery
            </CardTitle>
            <CardDescription>
              Identify and fill transaction gaps in the last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => gapRecoveryMutation.mutate()}
              disabled={isRunning}
              variant="outline"
              className="w-full"
            >
              {isRunning && gapRecoveryMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Start Gap Recovery
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Last Sync Result */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle>Last Sync Result</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant={lastResult.status === 'success' ? 'default' : 'destructive'}>
              <AlertDescription>
                <strong>{lastResult.status.toUpperCase()}:</strong> {lastResult.message}
              </AlertDescription>
            </Alert>
            {lastResult.data && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(lastResult.data, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Gaps Detail */}
      {syncStatus && syncStatus.recovery.totalGaps > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Gaps Analysis</CardTitle>
            <CardDescription>
              Days with missing or incomplete transaction data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncStatus.recovery.gapDetails.map((gap, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded">
                  <span className="font-mono text-sm">
                    {new Date(gap.date).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {gap.actualCount} transactions
                    </span>
                    <Badge variant={gap.status === 'missing' ? 'destructive' : 'secondary'}>
                      {gap.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VendonSync;