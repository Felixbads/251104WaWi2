/**
 * Cost Calculation Status Indicator for Dashboard
 * Shows the status of real-time cost calculation for transactions
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calculator, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface CostCalculationStats {
  total: number;
  byStatus: {
    pending?: number;
    calculated?: number;
    fallback?: number;
    error?: number;
  };
  recentCalculations: number;
}

export function CostCalculationIndicator() {
  const [isCalculating, setIsCalculating] = useState(false);
  
  const { data: stats, isLoading, refetch } = useQuery<{ success: boolean; stats: CostCalculationStats }>({
    queryKey: ['/api/transaction-costs/status'],
  });

  const handleBatchCalculate = async () => {
    setIsCalculating(true);
    try {
      const response = await fetch('/api/transaction-costs/batch-calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 500 })
      });
      
      if (response.ok) {
        await refetch();
      }
    } catch (error) {
      console.error('Error triggering batch calculation:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="h-32">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const calculationStats = stats?.stats;
  const pendingCount = calculationStats?.byStatus.pending || 0;
  const calculatedCount = calculationStats?.byStatus.calculated || 0;
  const totalCount = calculationStats?.total || 0;
  const calculatedPercentage = totalCount > 0 ? (calculatedCount / totalCount) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center">
          <Calculator className="h-4 w-4 mr-2" />
          Kostenkalkulation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span>Berechnet:</span>
          <span className="font-medium">{calculatedCount.toLocaleString()} / {totalCount.toLocaleString()}</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-green-600 h-2 rounded-full transition-all duration-300" 
            style={{ width: `${calculatedPercentage}%` }}
          />
        </div>
        
        <div className="text-xs text-center text-gray-600">
          {calculatedPercentage.toFixed(1)}% der Transaktionen haben echte Kostenkalkulationen
        </div>
        
        {pendingCount > 0 && (
          <Button 
            onClick={handleBatchCalculate}
            disabled={isCalculating}
            size="sm"
            className="w-full"
            variant="outline"
          >
            {isCalculating ? (
              <>
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                Berechnung läuft...
              </>
            ) : (
              <>
                <Calculator className="h-3 w-3 mr-2" />
                {pendingCount} Kosten berechnen
              </>
            )}
          </Button>
        )}
        
        {pendingCount === 0 && calculatedCount > 0 && (
          <div className="flex items-center justify-center text-green-600 text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            Alle Kosten berechnet
          </div>
        )}
      </CardContent>
    </Card>
  );
}