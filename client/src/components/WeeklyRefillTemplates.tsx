import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { 
  Calendar, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Play, 
  AlertTriangle,
  CheckCircle,
  Info,
  Eye,
  Settings
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface WeeklyTemplateChange {
  productName: string;
  oldQuantity: number;
  newQuantity: number;
  changeType: 'increase' | 'decrease' | 'unchanged';
  changePercentage: number;
  reasons: string[];
  confidence: number;
}

interface WeeklyTemplate {
  machineId: number;
  machineName: string;
  templateId: number;
  templateName: string;
  weekStart: string;
  weekEnd: string;
  changes: WeeklyTemplateChange[];
  summary: {
    totalProducts: number;
    changedProducts: number;
    increasedProducts: number;
    decreasedProducts: number;
    weatherFactorApplied: boolean;
    mhdFactorApplied: boolean;
  };
  explanationText: string;
}

interface WeeklyTemplateStatus {
  isRunning: boolean;
  schedule: string;
  timezone: string;
  nextExecution: string;
}

export function WeeklyRefillTemplates() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<WeeklyTemplate | null>(null);
  const [showChangesDialog, setShowChangesDialog] = useState(false);

  // Status des wöchentlichen Cron-Services
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/weekly-refill-templates/status'],
    refetchInterval: 30000, // Alle 30 Sekunden aktualisieren
  });

  // Übersicht aller wöchentlichen Templates
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
    queryKey: ['/api/weekly-refill-templates/overview'],
  });

  // Manuelle Ausführung
  const runManualMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/weekly-refill-templates/run-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('Fehler bei der manuellen Ausführung');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Erfolgreich",
        description: "Wöchentliche Templates wurden manuell erstellt",
      });
      refetchOverview();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "❌ Fehler",
        description: error.message || "Fehler bei der manuellen Ausführung",
      });
    },
  });

  // Template-Änderungen laden
  const loadTemplateChanges = async (templateId: number) => {
    const response = await fetch(`/api/weekly-refill-templates/changes/${templateId}`);
    
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Änderungen');
    }
    
    return response.json();
  };

  const handleViewChanges = async (template: any) => {
    try {
      const changesData = await loadTemplateChanges(template.templateId);
      
      setSelectedTemplate({
        ...template,
        changes: changesData.data.changes,
        explanationText: changesData.data.explanationText,
      });
      setShowChangesDialog(true);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "❌ Fehler",
        description: "Änderungen konnten nicht geladen werden",
      });
    }
  };

  if (statusLoading || overviewLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Wöchentliche Refill-Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const cronStatus = status?.data?.cron;
  const templates = overview?.data || [];
  const overviewSummary = overview?.summary || {};

  return (
    <div className="space-y-6">
      {/* Status und Steuerung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Wöchentliche Template-Automatisierung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Cron-Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Status</span>
              </div>
              <Badge variant={cronStatus?.isRunning ? "default" : "destructive"}>
                {cronStatus?.isRunning ? "Aktiv" : "Inaktiv"}
              </Badge>
              <div className="text-xs text-muted-foreground">
                {cronStatus?.schedule}
              </div>
            </div>

            {/* Nächste Ausführung */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-medium">Nächste Ausführung</span>
              </div>
              <div className="text-sm">
                {cronStatus?.nextExecution || 'Unbekannt'}
              </div>
            </div>

            {/* Template-Statistiken */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Aktive Templates</span>
              </div>
              <div className="text-2xl font-bold">
                {overviewSummary.totalActiveTemplates || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {overviewSummary.totalChanges || 0} Änderungen insgesamt
              </div>
            </div>

            {/* Manuelle Ausführung */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                <span className="text-sm font-medium">Manuelle Ausführung</span>
              </div>
              <Button 
                onClick={() => runManualMutation.mutate()}
                disabled={runManualMutation.isPending}
                size="sm"
                className="w-full"
              >
                {runManualMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  "Jetzt ausführen"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template-Übersicht */}
      <Card>
        <CardHeader>
          <CardTitle>Aktuelle Wöchentliche Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine wöchentlichen Templates erstellt</p>
              <p className="text-sm">Templates werden jeden Sonntag um 6:00 Uhr automatisch erstellt</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Maschine</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Erstellt am</TableHead>
                  <TableHead>Änderungen</TableHead>
                  <TableHead>Faktoren</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template: any) => (
                  <TableRow key={template.templateId}>
                    <TableCell>
                      <div className="font-medium">{template.machineName || `Maschine ${template.machineId}`}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{template.templateName}</div>
                      <div className="text-xs text-muted-foreground">{template.description}</div>
                    </TableCell>
                    <TableCell>
                      {format(parseISO(template.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {template.changeStats?.totalChanges || 0} Änderungen
                        </Badge>
                        {template.changeStats?.increases > 0 && (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            {template.changeStats.increases}
                          </Badge>
                        )}
                        {template.changeStats?.decreases > 0 && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            {template.changeStats.decreases}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">
                          <Info className="h-3 w-3 mr-1" />
                          MHD
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Wetter
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewChanges(template)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog für Template-Details */}
      <Dialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Template-Details: {selectedTemplate?.templateName}
            </DialogTitle>
            <DialogDescription>
              {selectedTemplate?.machineName} • Woche {selectedTemplate?.weekStart} bis {selectedTemplate?.weekEnd}
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-6">
              {/* Zusammenfassung */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedTemplate.summary?.totalProducts || 0}</div>
                  <div className="text-sm text-muted-foreground">Produkte gesamt</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{selectedTemplate.summary?.changedProducts || 0}</div>
                  <div className="text-sm text-muted-foreground">Geändert</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{selectedTemplate.summary?.increasedProducts || 0}</div>
                  <div className="text-sm text-muted-foreground">Erhöht</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{selectedTemplate.summary?.decreasedProducts || 0}</div>
                  <div className="text-sm text-muted-foreground">Reduziert</div>
                </div>
              </div>

              {/* Begründungstext */}
              {selectedTemplate.explanationText && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Begründung der Änderungen</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="whitespace-pre-line text-sm">
                      {selectedTemplate.explanationText}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Änderungen-Tabelle */}
              {selectedTemplate.changes && selectedTemplate.changes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Produkt-Änderungen</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead>Vorher</TableHead>
                          <TableHead>Nachher</TableHead>
                          <TableHead>Änderung</TableHead>
                          <TableHead>Begründung</TableHead>
                          <TableHead>Konfidenz</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTemplate.changes
                          .filter(change => change.changeType !== 'unchanged')
                          .map((change, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {change.productName}
                            </TableCell>
                            <TableCell>{change.oldQuantity}</TableCell>
                            <TableCell>{change.newQuantity}</TableCell>
                            <TableCell>
                              <Badge
                                variant={change.changeType === 'increase' ? 'default' : 'secondary'}
                                className={
                                  change.changeType === 'increase' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-orange-100 text-orange-800'
                                }
                              >
                                {change.changeType === 'increase' ? (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                )}
                                {change.changePercentage > 0 ? `+${change.changePercentage}%` : `${change.changePercentage}%`}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {change.reasons.map((reason, reasonIndex) => (
                                  <div key={reasonIndex} className="text-xs text-muted-foreground">
                                    {reason}
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {Math.round(change.confidence * 100)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}