import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, TrendingUp, Clock } from "lucide-react";
import { useEffect, useState } from "react";

interface DatabaseStats {
  transactions: number;
  products: number;
  machines: number;
  suppliers: number;
  openOrders: number;
  lastUpdated: string;
}

export default function LiveDatabaseStatsTile() {
  // Widget deaktiviert - von User angefordert  
  return null;
}
  const [isGrowing, setIsGrowing] = useState(false);

  // Datenbankstatistiken alle 10 Sekunden abrufen
  const { data: stats, isLoading } = useQuery<DatabaseStats>({
    queryKey: ['/api/statistics/database'],
    refetchInterval: 10000, // 10 Sekunden
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Wachstums-Animation bei neuen Transaktionen
  useEffect(() => {
    if (stats && previousTransactions !== null && stats.transactions > previousTransactions) {
      setIsGrowing(true);
      const timer = setTimeout(() => setIsGrowing(false), 2000);
      return () => clearTimeout(timer);
    }
    if (stats && previousTransactions === null) {
      setPreviousTransactions(stats.transactions);
    } else if (stats) {
      setPreviousTransactions(stats.transactions);
    }
  }, [stats?.transactions, previousTransactions]);

  if (isLoading && !stats) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            Datenbankstatistiken
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-8 bg-gray-200 rounded"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('de-DE').format(num);
  };

  const formatLastUpdated = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-600" />
          Datenbankstatistiken
        </CardTitle>
        {stats?.lastUpdated && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Letzte Aktualisierung: {formatLastUpdated(stats.lastUpdated)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hauptstatistik: Transaktionen mit Animation */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Transaktionen</p>
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-bold transition-all duration-500 ${
                isGrowing ? 'text-green-600 scale-110' : 'text-gray-900'
              }`}>
                {stats ? formatNumber(stats.transactions) : '0'}
              </p>
              {isGrowing && (
                <TrendingUp className="h-4 w-4 text-green-600 animate-pulse" />
              )}
            </div>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">Automaten</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats ? formatNumber(stats.machines) : '0'}
            </p>
          </div>
        </div>

        {/* Zusätzliche Statistiken */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Ereignisse</p>
            <p className="text-xl font-semibold text-gray-800">
              {stats ? formatNumber(stats.openOrders) : '0'}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">Produkte</p>
            <p className="text-xl font-semibold text-gray-800">
              {stats ? formatNumber(stats.products) : '0'}
            </p>
          </div>
        </div>

        {/* Live-Import Status */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Synchronisation verwalten</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-600">Live</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}