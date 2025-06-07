import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Clock, 
  MapPin,
  ChevronRight,
  PackageX
} from "lucide-react";

interface MHDAlert {
  machineId: number;
  machineName: string;
  location: string;
  totalProducts: number;
  expiredCount: number;
  warningCount: number;
  attentionCount: number;
  alertLevel: 'expired' | 'warning' | 'attention';
  earliestExpiry: string;
  daysUntilEarliestExpiry: number;
  criticalProducts: string[];
}

export default function MHDAlertTile() {
  const [, setLocation] = useLocation();

  const { data: alerts = [], isLoading, error } = useQuery<MHDAlert[]>({
    queryKey: ['/api/mhd-alerts'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <Clock className="h-5 w-5" />
            MHD-Warnungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-orange-600">Lade MHD-Status...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || alerts.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Clock className="h-5 w-5" />
            MHD-Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-green-600">
            Alle Automaten haben gültige MHD-Daten
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalMachines = alerts.filter(alert => alert.alertLevel === 'expired');
  const warningMachines = alerts.filter(alert => alert.alertLevel === 'warning');
  const totalCritical = criticalMachines.length + warningMachines.length;

  const getAlertStyles = () => {
    if (criticalMachines.length > 0) {
      return {
        cardClass: 'border-red-500 bg-red-50 shadow-red-200 shadow-lg',
        headerClass: 'text-red-900',
        subtextClass: 'text-red-700',
        badgeVariant: 'destructive' as const,
        icon: <PackageX className="h-5 w-5 text-red-600" />
      };
    }
    if (warningMachines.length > 0) {
      return {
        cardClass: 'border-orange-400 bg-orange-50 shadow-orange-200 shadow-md',
        headerClass: 'text-orange-900',
        subtextClass: 'text-orange-700',
        badgeVariant: 'secondary' as const,
        icon: <AlertTriangle className="h-5 w-5 text-orange-600" />
      };
    }
    return {
      cardClass: 'border-yellow-400 bg-yellow-50',
      headerClass: 'text-yellow-900',
      subtextClass: 'text-yellow-700',
      badgeVariant: 'secondary' as const,
      icon: <AlertTriangle className="h-5 w-5 text-yellow-600" />
    };
  };

  const alertStyles = getAlertStyles();

  return (
    <Card className={alertStyles.cardClass}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 ${alertStyles.headerClass}`}>
          {alertStyles.icon}
          MHD-Warnungen
          {totalCritical > 0 && (
            <Badge variant={alertStyles.badgeVariant} className="ml-auto">
              {totalCritical}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className={alertStyles.subtextClass}>
          {criticalMachines.length > 0 ? (
            `${criticalMachines.length} Automat${criticalMachines.length > 1 ? 'en' : ''} mit abgelaufenen Produkten`
          ) : (
            `${warningMachines.length} Automat${warningMachines.length > 1 ? 'en' : ''} mit bald ablaufenden Produkten`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Show top 3 most critical machines */}
        {alerts.slice(0, 3).map((alert) => (
          <div 
            key={alert.machineId}
            className="flex items-center justify-between p-2 rounded-md bg-white/70 hover:bg-white/90 transition-colors cursor-pointer"
            onClick={() => setLocation(`/automat/${alert.machineId}`)}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex flex-col flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {alert.machineName}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{alert.location}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`text-xs font-medium ${
                  alert.alertLevel === 'expired' ? 'text-red-600' : 'text-orange-600'
                }`}>
                  {alert.alertLevel === 'expired' ? 'Abgelaufen' : 'Bald fällig'}
                </div>
                <div className="text-xs text-gray-500">
                  {alert.expiredCount > 0 ? `${alert.expiredCount} Produkte` : 
                   alert.warningCount > 0 ? `${alert.warningCount} Produkte` : ''}
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        ))}
        
        {alerts.length > 3 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => setLocation('/status')}
          >
            Alle {alerts.length} betroffenen Automaten anzeigen
          </Button>
        )}

        <div className="pt-2 border-t border-gray-200">
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => setLocation('/status')}
          >
            Automat-Status öffnen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}