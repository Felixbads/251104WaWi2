import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { NavigationAuditTool } from '@/components/audit/NavigationAuditTool';
import { 
  Target, 
  TrendingUp, 
  Shield, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  RefreshCw,
  BarChart3,
  Settings,
  Info,
  Zap,
  Clock,
  Users
} from 'lucide-react';
import type { AuditResults } from '@/lib/services/NavigationAuditService';

interface DashboardStats {
  totalAudits: number;
  avgPerformanceScore: number;
  criticalIssues: number;
  fixedIssues: number;
  touchTargetCompliance: number;
  scrollContainerCompliance: number;
  lastAuditDate: string | null;
}

export default function NavigationAuditDashboard() {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalAudits: 0,
    avgPerformanceScore: 0,
    criticalIssues: 0,
    fixedIssues: 0,
    touchTargetCompliance: 100,
    scrollContainerCompliance: 100,
    lastAuditDate: null
  });
  const [lastAuditResults, setLastAuditResults] = useState<AuditResults | null>(null);
  const [selectedView, setSelectedView] = useState('overview');

  // Device detection for responsive dashboard
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isTablet = useMediaQuery("(min-width: 641px) and (max-width: 1024px)");
  const isDesktop = useMediaQuery("(min-width: 1025px)");

  const currentDevice = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';
  const DeviceIcon = isMobile ? Smartphone : isTablet ? Tablet : Monitor;

  // Mock data - In a real implementation, this would fetch from the API
  useEffect(() => {
    // Simulate loading dashboard statistics
    const mockStats: DashboardStats = {
      totalAudits: 12,
      avgPerformanceScore: 85,
      criticalIssues: 3,
      fixedIssues: 8,
      touchTargetCompliance: 92,
      scrollContainerCompliance: 88,
      lastAuditDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
    };
    setDashboardStats(mockStats);
  }, []);

  /**
   * Handle audit completion from NavigationAuditTool
   */
  const handleAuditComplete = (results: AuditResults) => {
    setLastAuditResults(results);
    
    // Update dashboard stats
    setDashboardStats(prev => ({
      ...prev,
      totalAudits: prev.totalAudits + 1,
      avgPerformanceScore: Math.round((prev.avgPerformanceScore + results.performanceScore) / 2),
      criticalIssues: results.summary.criticalIssues,
      lastAuditDate: new Date().toISOString()
    }));
  };

  /**
   * Get relative time string
   */
  const getRelativeTime = (dateString: string | null): string => {
    if (!dateString) return 'Nie';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 60) return `vor ${diffMins} Min`;
    if (diffHours < 24) return `vor ${diffHours} Std`;
    return `vor ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`;
  };

  /**
   * Get performance badge variant
   */
  const getPerformanceBadge = (score: number) => {
    if (score >= 80) return { variant: 'default' as const, text: 'Ausgezeichnet', color: 'text-green-600' };
    if (score >= 60) return { variant: 'secondary' as const, text: 'Gut', color: 'text-yellow-600' };
    if (score >= 40) return { variant: 'outline' as const, text: 'Verbesserung nötig', color: 'text-orange-600' };
    return { variant: 'destructive' as const, text: 'Kritisch', color: 'text-red-600' };
  };

  return (
    <div className="space-y-6 p-6" data-testid="navigation-audit-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Navigation Audit System</h1>
              <p className="text-muted-foreground">
                Mobile-First Navigation-Qualitätssicherung
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1 rounded-full bg-muted">
            <DeviceIcon className="h-4 w-4" />
            <span className="capitalize">{currentDevice}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Letzter Audit: {getRelativeTime(dashboardStats.lastAuditDate)}
          </div>
        </div>
      </div>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt-Performance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`text-2xl font-bold ${getPerformanceBadge(dashboardStats.avgPerformanceScore).color}`}>
                {dashboardStats.avgPerformanceScore}/100
              </div>
              <Badge variant={getPerformanceBadge(dashboardStats.avgPerformanceScore).variant}>
                {getPerformanceBadge(dashboardStats.avgPerformanceScore).text}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Durchschnitt aus {dashboardStats.totalAudits} Audits
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kritische Probleme</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{dashboardStats.criticalIssues}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.fixedIssues} bereits behoben
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Touch-Target Compliance</CardTitle>
            <Target className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {dashboardStats.touchTargetCompliance}%
            </div>
            <p className="text-xs text-muted-foreground">
              44px+ Mindestgröße erfüllt
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scroll-Container</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {dashboardStats.scrollContainerCompliance}%
            </div>
            <p className="text-xs text-muted-foreground">
              Scrollbarkeit korrekt implementiert
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System Status Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>System-Status:</strong> Navigation Audit System ist aktiv und überwacht kontinuierlich die Mobile-First Compliance. 
          Führen Sie regelmäßige Audits durch, um optimale Benutzerfreundlichkeit sicherzustellen.
        </AlertDescription>
      </Alert>

      {/* Main Dashboard Content */}
      <Tabs value={selectedView} onValueChange={setSelectedView} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-live-audit">
            <Target className="h-4 w-4 mr-2" />
            Live-Audit
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <Clock className="h-4 w-4 mr-2" />
            Verlauf
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="h-4 w-4 mr-2" />
            Einstellungen
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Audit Results */}
            {lastAuditResults && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Letztes Audit-Ergebnis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Performance Score</span>
                    <Badge variant={getPerformanceBadge(lastAuditResults.performanceScore).variant}>
                      {lastAuditResults.performanceScore}/100
                    </Badge>
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Gefundene Probleme:</span>
                      <span className="font-medium">{lastAuditResults.summary.totalIssues}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kritische Probleme:</span>
                      <span className="font-medium text-red-600">{lastAuditResults.summary.criticalIssues}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Auto-Fix verfügbar:</span>
                      <span className="font-medium text-blue-600">{lastAuditResults.summary.autoFixableIssues}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Touch-Targets geprüft:</span>
                      <span className="font-medium">{lastAuditResults.touchTargets.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Schnellaktionen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" onClick={() => setSelectedView('audit')} data-testid="button-run-quick-audit">
                  <Target className="h-4 w-4 mr-2" />
                  Sofort-Audit starten
                </Button>
                <Button variant="outline" className="w-full" disabled>
                  <Zap className="h-4 w-4 mr-2" />
                  Auto-Fixes anwenden ({dashboardStats.criticalIssues})
                </Button>
                <Button variant="outline" className="w-full" disabled>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  System-Health prüfen
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setSelectedView('history')}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Detaillierte Berichte
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Implementation Guidelines */}
          <Card>
            <CardHeader>
              <CardTitle>Mobile-First Navigation Best Practices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-green-700 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Erfolgreich implementiert
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                      <span>Enhanced Tabs-Komponente mit Auto-Scroll</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                      <span>Scroll-Buttons für horizontale Navigation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                      <span>44px+ Touch-Target Enforcement</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                      <span>Visuelle Overflow-Indikatoren</span>
                    </li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <h4 className="font-semibold text-blue-700 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Weitere Optimierungen
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      <span>Kontinuierliches Monitoring aktivieren</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      <span>Automatische Korrekturen erweitern</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      <span>Performance-Benchmarks definieren</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-2 w-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      <span>Benutzer-Feedback Integration</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Live Audit Tab */}
        <TabsContent value="audit" className="space-y-6">
          <NavigationAuditTool
            onAuditComplete={handleAuditComplete}
          />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Audit-Verlauf und Performance-Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Verlaufsdaten werden gesammelt</h3>
                <p>Führen Sie weitere Audits durch, um Trend-Analysen und historische Leistungsvergleiche zu sehen.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Audit-System Konfiguration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Monitoring Settings */}
              <div>
                <h4 className="font-semibold mb-3">Überwachungseinstellungen</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Kontinuierliches Monitoring aktivieren</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">E-Mail-Benachrichtigungen bei kritischen Problemen</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm">Automatische Korrekturen anwenden</span>
                  </label>
                </div>
              </div>

              <Separator />

              {/* Performance Thresholds */}
              <div>
                <h4 className="font-semibold mb-3">Performance-Schwellenwerte</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Minimum Performance Score
                    </label>
                    <input 
                      type="number" 
                      defaultValue={70}
                      min={0}
                      max={100}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Touch-Target Mindestgröße (px)
                    </label>
                    <input 
                      type="number" 
                      defaultValue={44}
                      min={24}
                      max={60}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button variant="outline">Einstellungen zurücksetzen</Button>
                <Button>Speichern</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}