import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TimeRangeFilter, { TimeRange, CustomTimeRange } from './TimeRangeFilter';
import { format, isAfter, isBefore, isWithinInterval } from 'date-fns';

// Typen für die Metriken
interface MetricData {
  title: string;
  icon: React.ReactNode;
  value: string | number;
  trend?: {
    value: string;
    isPositive: boolean;
    label: string;
  };
  color?: string;
  formatter?: (value: number) => string;
}

interface Transaction {
  id: string | number;
  datetime: string | number | Date;
  price: number;
  [key: string]: any;
}

interface MetricsTimeRangeCardProps {
  transactions: Transaction[];
  previousTransactions?: Transaction[];
  isLoading: boolean;
  className?: string;
  onTimeRangeChange?: (range: TimeRange | CustomTimeRange) => void;
}

// Hilfsfunktionen
const filterTransactionsByDateRange = (
  transactions: Transaction[],
  startDate: Date,
  endDate: Date
): Transaction[] => {
  return transactions.filter(tx => {
    const txDate = new Date(tx.datetime);
    return isWithinInterval(txDate, { start: startDate, end: endDate });
  });
};

const calculateTrend = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// Hauptkomponente
const MetricsTimeRangeCard: React.FC<MetricsTimeRangeCardProps> = ({
  transactions,
  previousTransactions,
  isLoading,
  className = '',
  onTimeRangeChange
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange | CustomTimeRange>({
    label: 'Letzte 7 Tage',
    value: 'last7days',
    startDate: new Date(new Date().setDate(new Date().getDate() - 7)),
    endDate: new Date()
  });
  
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  
  // Zeitraum ändern
  const handleTimeRangeChange = (range: TimeRange | CustomTimeRange) => {
    setSelectedTimeRange(range);
    if (onTimeRangeChange) {
      onTimeRangeChange(range);
    }
  };
  
  // Transaktionen nach Zeitraum filtern
  useEffect(() => {
    if (transactions.length > 0) {
      const filtered = filterTransactionsByDateRange(
        transactions,
        selectedTimeRange.startDate,
        selectedTimeRange.endDate
      );
      setFilteredTransactions(filtered);
    }
  }, [transactions, selectedTimeRange]);
  
  // Metriken berechnen
  useEffect(() => {
    if (filteredTransactions.length === 0 && !isLoading) {
      setMetrics([
        {
          title: 'Gesamtumsatz',
          icon: '💰',
          value: '0,00 €',
          formatter: (val) => `${val.toFixed(2).replace('.', ',')} €`
        },
        {
          title: 'Anzahl Transaktionen',
          icon: '🛒',
          value: '0',
          formatter: (val) => val.toString()
        },
        {
          title: 'Durchschnitt pro Transaktion',
          icon: '📊',
          value: '0,00 €',
          formatter: (val) => `${val.toFixed(2).replace('.', ',')} €`
        }
      ]);
      return;
    }
    
    // Berechne Metriken basierend auf gefilterten Transaktionen
    const totalRevenue = filteredTransactions.reduce((sum, tx) => sum + (tx.price || 0), 0);
    const totalTransactions = filteredTransactions.length;
    const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    
    // Berechne Vergleichsmetriken für den vorherigen Zeitraum, falls vorhanden
    let revenueTrend = 0;
    let transactionsTrend = 0;
    let avgTrend = 0;
    
    if (previousTransactions && previousTransactions.length > 0) {
      const prevRevenue = previousTransactions.reduce((sum, tx) => sum + (tx.price || 0), 0);
      const prevTransactions = previousTransactions.length;
      const prevAvg = prevTransactions > 0 ? prevRevenue / prevTransactions : 0;
      
      revenueTrend = calculateTrend(totalRevenue, prevRevenue);
      transactionsTrend = calculateTrend(totalTransactions, prevTransactions);
      avgTrend = calculateTrend(avgTransactionValue, prevAvg);
    }
    
    setMetrics([
      {
        title: 'Gesamtumsatz',
        icon: '💰',
        value: totalRevenue.toFixed(2).replace('.', ',') + ' €',
        trend: previousTransactions ? {
          value: `${Math.abs(revenueTrend).toFixed(1)}%`,
          isPositive: revenueTrend >= 0,
          label: 'vs. voriger Zeitraum'
        } : undefined,
        formatter: (val) => `${val.toFixed(2).replace('.', ',')} €`
      },
      {
        title: 'Anzahl Transaktionen',
        icon: '🛒',
        value: totalTransactions,
        trend: previousTransactions ? {
          value: `${Math.abs(transactionsTrend).toFixed(1)}%`,
          isPositive: transactionsTrend >= 0,
          label: 'vs. voriger Zeitraum'
        } : undefined,
        formatter: (val) => val.toString()
      },
      {
        title: 'Durchschnitt pro Transaktion',
        icon: '📊',
        value: avgTransactionValue.toFixed(2).replace('.', ',') + ' €',
        trend: previousTransactions ? {
          value: `${Math.abs(avgTrend).toFixed(1)}%`,
          isPositive: avgTrend >= 0,
          label: 'vs. voriger Zeitraum'
        } : undefined,
        formatter: (val) => `${val.toFixed(2).replace('.', ',')} €`
      }
    ]);
  }, [filteredTransactions, isLoading, previousTransactions]);
  
  // Formatiere das Datum für die Anzeige
  const getTimeRangeDisplay = () => {
    const { startDate, endDate } = selectedTimeRange;
    return `${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`;
  };
  
  return (
    <div className={className}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-3">
        <h3 className="text-lg font-semibold">Dashboard Metriken</h3>
        <div className="flex items-center gap-2">
          <TimeRangeFilter 
            onChange={handleTimeRangeChange} 
            selectedRange={'value' in selectedTimeRange ? selectedTimeRange.value : 'custom'}
            compact
          />
          <div className="text-xs text-muted-foreground hidden md:block">
            Zeitraum: {getTimeRangeDisplay()}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-3 md:hidden">
        Zeitraum: {getTimeRangeDisplay()}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((metric, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{metric.title}</div>
                  <div className="text-2xl font-bold mt-1">{metric.value}</div>
                </div>
                <div className="text-2xl bg-muted/30 p-2 rounded-full">{metric.icon}</div>
              </div>
              
              {metric.trend && (
                <div className="mt-2 flex items-center text-xs">
                  <div
                    className={`${
                      metric.trend.isPositive ? 'text-green-500' : 'text-red-500'
                    } flex items-center`}
                  >
                    {metric.trend.isPositive ? '↑' : '↓'} {metric.trend.value}
                  </div>
                  <div className="ml-1 text-muted-foreground">
                    {metric.trend.label}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MetricsTimeRangeCard;