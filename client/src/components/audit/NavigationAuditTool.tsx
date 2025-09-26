import { useState, useEffect, useCallback } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Zap, 
  Monitor, 
  Smartphone, 
  Tablet,
  Info,
  Settings,
  TrendingUp,
  Target
} from 'lucide-react';
import { navigationAuditService, type AuditResults, type AuditOptions } from '@/lib/services/NavigationAuditService';
import type { NavigationIssue, TouchTargetMetric, ScrollabilityTest } from '@shared/schema';

interface NavigationAuditToolProps {
  autoRun?: boolean;
  onAuditComplete?: (results: AuditResults) => void;
}

export const NavigationAuditTool = ({ autoRun = false, onAuditComplete }: NavigationAuditToolProps) => {
  const [auditResults, setAuditResults] = useState<AuditResults | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedAuditType, setSelectedAuditType] = useState<'full' | 'tabs' | 'touch-targets' | 'scrollability' | 'responsive'>('full');
  const [autoFixEnabled, setAutoFixEnabled] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [selectedTab, setSelectedTab] = useState('issues');
  
  // Device detection
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isTablet = useMediaQuery("(min-width: 641px) and (max-width: 1024px)");
  const isDesktop = useMediaQuery("(min-width: 1025px)");
  
  const currentDevice = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';
  const DeviceIcon = isMobile ? Smartphone : isTablet ? Tablet : Monitor;

  /**
   * Execute the navigation audit
   */
  const runAudit = useCallback(async () => {
    setIsRunning(true);
    setCurrentProgress(0);
    
    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setCurrentProgress(prev => Math.min(prev + Math.random() * 20, 90));
      }, 200);

      const options: AuditOptions = {
        auditType: selectedAuditType,
        deviceType: currentDevice,
        includeAutoFixes: autoFixEnabled,
        performanceThreshold: 70
      };

      const results = await navigationAuditService.runAudit(options);
      
      clearInterval(progressInterval);
      setCurrentProgress(100);
      
      setAuditResults(results);
      onAuditComplete?.(results);
      
    } catch (error) {
      console.error('Audit failed:', error);
      alert(`Audit fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setIsRunning(false);
    }
  }, [selectedAuditType, currentDevice, autoFixEnabled, onAuditComplete]);

  // Auto-run audit on component mount if enabled
  useEffect(() => {
    if (autoRun) {
      setTimeout(runAudit, 1000);
    }
  }, [autoRun, runAudit]);

  /**
   * Get badge color based on issue severity
   */
  const getIssueColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'default';
      case 'info': return 'secondary';
      default: return 'outline';
    }
  };

  /**
   * Get performance score color and description
   */
  const getPerformanceInfo = (score: number) => {
    if (score >= 80) return { color: 'text-green-600', label: 'Ausgezeichnet', bg: 'bg-green-100' };
    if (score >= 60) return { color: 'text-yellow-600', label: 'Gut', bg: 'bg-yellow-100' };
    if (score >= 40) return { color: 'text-orange-600', label: 'Verbesserungsbedarf', bg: 'bg-orange-100' };
    return { color: 'text-red-600', label: 'Kritisch', bg: 'bg-red-100' };
  };

  return (
    <div className="space-y-6" data-testid="navigation-audit-tool">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Mobile-First Navigation Audit</h1>
          </div>
          <p className="text-muted-foreground">
            Systemweite Überprüfung der Menüführung und Navigation-Komponenten
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <DeviceIcon className="h-4 w-4" />
            <span className="capitalize">{currentDevice}</span>
            <span>•</span>
            <span>{window.innerWidth}×{window.innerHeight}px</span>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Audit-Konfiguration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Audit Type Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Audit-Typ</label>
              <select 
                value={selectedAuditType} 
                onChange={(e) => setSelectedAuditType(e.target.value as any)}
                className="w-full p-2 border rounded-md"
                disabled={isRunning}
                data-testid="select-audit-type"
              >
                <option value="full">Vollständiges Audit</option>
                <option value="tabs">Tab-Navigation</option>
                <option value="touch-targets">Touch-Targets</option>
                <option value="scrollability">Scrollbarkeit</option>
                <option value="responsive">Responsive Design</option>
              </select>
            </div>
            
            {/* Auto-Fix Toggle */}
            <div>
              <label className="text-sm font-medium mb-2 block">Automatische Korrekturen</label>
              <label className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={autoFixEnabled}
                  onChange={(e) => setAutoFixEnabled(e.target.checked)}
                  disabled={isRunning}
                  data-testid="checkbox-auto-fix"
                />
                <span className="text-sm">Probleme automatisch korrigieren</span>
              </label>
            </div>

            {/* Action Button */}
            <div className="flex items-end">
              <Button 
                onClick={runAudit}
                disabled={isRunning}
                size="lg"
                className="w-full"
                data-testid="button-run-audit"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Audit läuft...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Audit starten
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Audit-Fortschritt</span>
                <span>{Math.round(currentProgress)}%</span>
              </div>
              <Progress value={currentProgress} className="w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Section */}
      {auditResults && (
        <>
          {/* Performance Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Performance Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${getPerformanceInfo(auditResults.performanceScore).color}`}>
                  {auditResults.performanceScore}/100
                </div>
                <div className={`text-sm px-2 py-1 rounded-full inline-block mt-2 ${getPerformanceInfo(auditResults.performanceScore).bg}`}>
                  {getPerformanceInfo(auditResults.performanceScore).label}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Probleme gefunden</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {auditResults.summary.totalIssues}
                </div>
                <div className="text-sm text-muted-foreground">
                  {auditResults.summary.criticalIssues} kritisch, {auditResults.summary.warningIssues} Warnungen
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Touch-Target Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {auditResults.touchTargets.length > 0 
                    ? Math.round((auditResults.summary.touchTargetCompliance / auditResults.touchTargets.length) * 100)
                    : 100}%
                </div>
                <div className="text-sm text-muted-foreground">
                  {auditResults.summary.touchTargetCompliance} von {auditResults.touchTargets.length} konform
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Auto-Fix Verfügbar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {auditResults.summary.autoFixableIssues}
                </div>
                <div className="text-sm text-muted-foreground">
                  {auditResults.summary.autoFixableIssues > 0 ? 'Automatisch korrigierbar' : 'Keine verfügbar'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Results Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Detaillierte Audit-Ergebnisse</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="issues" data-testid="tab-issues">
                    Probleme ({auditResults.issues.length})
                  </TabsTrigger>
                  <TabsTrigger value="touch" data-testid="tab-touch-targets">
                    Touch-Targets ({auditResults.touchTargets.length})
                  </TabsTrigger>
                  <TabsTrigger value="scroll" data-testid="tab-scrollability">
                    Scrollbarkeit ({auditResults.scrollabilityTests.length})
                  </TabsTrigger>
                  <TabsTrigger value="recommendations" data-testid="tab-recommendations">
                    Empfehlungen
                  </TabsTrigger>
                </TabsList>

                {/* Issues Tab */}
                <TabsContent value="issues" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Identifizierte Navigation-Probleme</h3>
                    {auditResults.summary.autoFixableIssues > 0 && (
                      <Button variant="outline" size="sm" disabled>
                        <Zap className="h-4 w-4 mr-2" />
                        {auditResults.summary.autoFixableIssues} Auto-Fixes anwenden
                      </Button>
                    )}
                  </div>

                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4" data-testid="issues-list">
                      {auditResults.issues.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
                          <p className="text-lg font-medium">Keine Probleme gefunden!</p>
                          <p>Ihre Navigation erfüllt alle Audit-Kriterien.</p>
                        </div>
                      ) : (
                        auditResults.issues.map((issue, index) => (
                          <div key={index} className="border rounded-lg p-4 space-y-3" data-testid={`issue-${index}`}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <Badge variant={getIssueColor(issue.severity)}>
                                  {issue.severity.toUpperCase()}
                                </Badge>
                                <span className="font-medium">{issue.component}</span>
                                {issue.autoFixable && (
                                  <Badge variant="outline">
                                    <Zap className="h-3 w-3 mr-1" />
                                    Auto-Fix
                                  </Badge>
                                )}
                              </div>
                              {issue.severity === 'critical' ? (
                                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                              ) : (
                                <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                              )}
                            </div>

                            <div>
                              <h4 className="font-semibold mb-1">{issue.description}</h4>
                              <p className="text-sm text-muted-foreground mb-2">
                                <strong>Ort:</strong> {issue.location}
                              </p>
                              <p className="text-sm text-muted-foreground mb-2">
                                <strong>Betroffene Breakpoints:</strong> {issue.affectedBreakpoints?.join(', ') || 'Unbekannt'}
                              </p>
                              {issue.currentValue && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  <strong>Aktuell:</strong> {issue.currentValue} | <strong>Erwartet:</strong> {issue.expectedValue}
                                </p>
                              )}
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border">
                              <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                <div>
                                  <strong className="text-sm text-blue-800 dark:text-blue-200">Empfehlung:</strong>
                                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                                    {issue.recommendation}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Touch Targets Tab */}
                <TabsContent value="touch" className="space-y-4">
                  <h3 className="text-lg font-semibold">Touch-Target Analyse</h3>
                  <Alert>
                    <Target className="h-4 w-4" />
                    <AlertDescription>
                      Mindestgröße für Touch-Targets: 44×44px (Apple/Google Empfehlung)
                    </AlertDescription>
                  </Alert>
                  
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2" data-testid="touch-targets-list">
                      {auditResults.touchTargets.map((target, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded">
                          <div className="flex items-center gap-3">
                            {target.isCompliant ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <div>
                              <span className="font-medium">{target.elementType}</span>
                              <div className="text-sm text-muted-foreground">
                                {Math.round(target.width)}×{Math.round(target.height)}px
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={target.isCompliant ? 'default' : 'destructive'}>
                              {target.complianceScore}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Scrollability Tab */}
                <TabsContent value="scroll" className="space-y-4">
                  <h3 className="text-lg font-semibold">Scrollbarkeit-Tests</h3>
                  
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4" data-testid="scrollability-tests-list">
                      {auditResults.scrollabilityTests.map((test, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium">{test.containerType}</h4>
                            <div className="flex items-center gap-2">
                              {test.hasOverflow && (
                                <Badge variant="outline">Overflow</Badge>
                              )}
                              {test.isScrollable && (
                                <Badge variant="default">Scrollbar</Badge>
                              )}
                              {test.hasScrollButtons && (
                                <Badge variant="secondary">Scroll-Buttons</Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                            <div>
                              <span className="text-muted-foreground">Container:</span> {Math.round(test.containerWidth || 0)}px
                            </div>
                            <div>
                              <span className="text-muted-foreground">Inhalt:</span> {Math.round(test.contentWidth || 0)}px
                            </div>
                          </div>

                          {test.issues && test.issues.length > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border mb-3">
                              <h5 className="font-medium text-red-800 dark:text-red-200 mb-2">Probleme:</h5>
                              <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300">
                                {test.issues.map((issue, i) => (
                                  <li key={i}>{issue}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {test.recommendations && test.recommendations.length > 0 && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border">
                              <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Empfehlungen:</h5>
                              <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-300">
                                {test.recommendations.map((rec, i) => (
                                  <li key={i}>{rec}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Recommendations Tab */}
                <TabsContent value="recommendations" className="space-y-4">
                  <h3 className="text-lg font-semibold">Implementierungsrichtlinien</h3>
                  
                  <div className="grid gap-6">
                    {/* Mobile Navigation Guidelines */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Mobile Navigation Best Practices</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm">Horizontale Tabs mit scroll-Funktionalität auf Viewports unter 768px</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm">Minimum Touch-Target-Größe von 44×44px für alle interaktiven Elemente</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm">Scroll-Buttons und visuelle Overflow-Indikatoren für Tab-Navigation</p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Performance Guidelines */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Performance Optimierung</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm">Smooth scroll behavior für bessere UX bei Tab-Navigation</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm">ResizeObserver für responsive scroll-Button Aktualisierung</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm">CSS-basierte scrollbar-hide für saubere mobile Darstellung</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};