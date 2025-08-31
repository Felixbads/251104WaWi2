import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Package, 
  Clock, 
  CheckCircle, 
  RefreshCw,
  TrendingUp,
  ShoppingCart,
  AlertCircle,
  Calendar
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// Interfaces
interface MHDRecommendation {
  id: number;
  machineId: number;
  machineName: string;
  productId: number;
  productName: string;
  currentStock: number;
  daysUntilExpiry: number;
  avgDailySales: number;
  recommendedQuantity: number;
  expiryRiskFactor: number;
  stockoutProbability: number;
  priorityScore: number;
  riskCategory: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'ordered' | 'rejected';
  confidence: number;
  createdAt: string;
}

interface MHDRecommendationsResponse {
  success: boolean;
  data: {
    recommendations: MHDRecommendation[];
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      estimatedValue: number;
      averageConfidence: number;
    };
  };
}

// API Functions
const fetchMHDRecommendations = async (): Promise<MHDRecommendationsResponse> => {
  const response = await fetch('/api/mhd-recommendations');
  if (!response.ok) {
    throw new Error('Failed to fetch MHD recommendations');
  }
  return response.json();
};

const generateMHDRecommendations = async () => {
  const response = await fetch('/api/mhd-recommendations/batch-generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      onlyCritical: false,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to generate recommendations');
  }
  
  return response.json();
};

const bulkApproveRecommendations = async (recommendationIds: number[]) => {
  const response = await fetch('/api/mhd-recommendations/bulk-approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recommendationIds,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to approve recommendations');
  }
  
  return response.json();
};

// Helper functions
const getRiskCategoryColor = (category: string) => {
  switch (category) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const formatRiskCategory = (category: string) => {
  switch (category) {
    case 'critical': return 'Kritisch';
    case 'high': return 'Hoch';
    case 'medium': return 'Mittel';
    case 'low': return 'Niedrig';
    default: return category;
  }
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

const getRiskIcon = (category: string) => {
  switch (category) {
    case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'high': return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case 'medium': return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'low': return <CheckCircle className="h-4 w-4 text-green-500" />;
    default: return <Package className="h-4 w-4 text-gray-500" />;
  }
};

/**
 * MHD Order Component - Zeigt MHD-basierte Nachfüllempfehlungen an
 */
interface MHDOrderComponentProps {
  onCreateOrder: (recommendations: MHDRecommendation[]) => void;
  onBack: () => void;
}

const MHDOrderComponent: React.FC<MHDOrderComponentProps> = ({
  onCreateOrder,
  onBack
}) => {
  const [selectedRecommendations, setSelectedRecommendations] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const { 
    data: recommendationsData, 
    isLoading, 
    error, 
    refetch 
  } = useQuery({
    queryKey: ['/api/mhd-recommendations'],
    queryFn: fetchMHDRecommendations,
    refetchInterval: 30 * 1000, // Alle 30 Sekunden aktualisieren
  });

  // Handle recommendation selection
  const toggleRecommendation = (id: number) => {
    setSelectedRecommendations(prev => 
      prev.includes(id) 
        ? prev.filter(recId => recId !== id)
        : [...prev, id]
    );
  };

  const selectAllCritical = () => {
    if (!recommendationsData?.data.recommendations) return;
    
    const criticalIds = recommendationsData.data.recommendations
      .filter(rec => rec.riskCategory === 'critical' && rec.status === 'pending')
      .map(rec => rec.id);
    
    setSelectedRecommendations(criticalIds);
  };

  const clearSelection = () => {
    setSelectedRecommendations([]);
  };

  // Handle generate new recommendations
  const handleGenerateRecommendations = async () => {
    setIsGenerating(true);
    try {
      await generateMHDRecommendations();
      await refetch();
    } catch (error) {
      console.error('Error generating recommendations:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (selectedRecommendations.length === 0) return;
    
    setIsApproving(true);
    try {
      await bulkApproveRecommendations(selectedRecommendations);
      await refetch();
      setSelectedRecommendations([]);
    } catch (error) {
      console.error('Error approving recommendations:', error);
    } finally {
      setIsApproving(false);
    }
  };

  // Handle create order from selected recommendations
  const handleCreateOrder = () => {
    if (!recommendationsData?.data.recommendations || selectedRecommendations.length === 0) return;
    
    const selectedRecs = recommendationsData.data.recommendations.filter(
      rec => selectedRecommendations.includes(rec.id)
    );
    
    onCreateOrder(selectedRecs);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              MHD-Optimierte Bestellung
            </CardTitle>
            <CardDescription>
              Lädt Nachfüllempfehlungen basierend auf Mindesthaltbarkeitsdaten...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !recommendationsData?.success) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Fehler beim Laden der MHD-Empfehlungen
            </CardTitle>
            <CardDescription>
              Die Nachfüllempfehlungen konnten nicht geladen werden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Möglicherweise sind noch keine Empfehlungen generiert worden oder es liegt ein Verbindungsfehler vor.
            </p>
            <div className="flex space-x-3">
              <Button onClick={handleGenerateRecommendations} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generiere...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Empfehlungen generieren
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={onBack}>
                Zurück
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const recommendations = recommendationsData.data.recommendations;
  const summary = recommendationsData.data.summary;
  
  const pendingRecommendations = recommendations.filter(rec => rec.status === 'pending');
  const selectedRecs = recommendations.filter(rec => selectedRecommendations.includes(rec.id));
  const totalSelectedValue = selectedRecs.reduce((sum, rec) => sum + (rec.recommendedQuantity * 2.5), 0); // Geschätzter Preis

  return (
    <div className="space-y-6">
      {/* Header and Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            MHD-Optimierte Bestellung
          </CardTitle>
          <CardDescription>
            Empfehlungen basierend auf Mindesthaltbarkeitsdaten und Verderbrisiko
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{summary.critical}</div>
              <div className="text-sm text-gray-600">Kritisch</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{summary.high}</div>
              <div className="text-sm text-gray-600">Hoch</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{summary.medium}</div>
              <div className="text-sm text-gray-600">Mittel</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{summary.low}</div>
              <div className="text-sm text-gray-600">Niedrig</div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Geschätzter Gesamtwert: {formatCurrency(summary.estimatedValue)} | 
              Durchschnittliche Konfidenz: {Math.round(summary.averageConfidence * 100)}%
            </div>
            <div className="text-sm text-muted-foreground">
              Generiert: {format(new Date(), 'dd.MM.yyyy HH:mm', { locale: de })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={handleGenerateRecommendations} 
              disabled={isGenerating}
              variant="outline"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generiere...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Neu generieren
                </>
              )}
            </Button>
            
            <Button 
              onClick={selectAllCritical}
              variant="outline"
              disabled={summary.critical === 0}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Alle kritischen wählen
            </Button>
            
            <Button 
              onClick={clearSelection}
              variant="outline"
              disabled={selectedRecommendations.length === 0}
            >
              Auswahl löschen
            </Button>
            
            <Button 
              onClick={handleBulkApprove}
              disabled={selectedRecommendations.length === 0 || isApproving}
              variant="outline"
            >
              {isApproving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Genehmige...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Auswahl genehmigen ({selectedRecommendations.length})
                </>
              )}
            </Button>
            
            <Button 
              onClick={handleCreateOrder}
              disabled={selectedRecommendations.length === 0}
              className="ml-auto"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Bestellung erstellen ({selectedRecommendations.length})
            </Button>
          </div>
          
          {selectedRecommendations.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border">
              <div className="text-sm">
                <strong>{selectedRecommendations.length}</strong> Empfehlungen ausgewählt | 
                Geschätzter Wert: <strong>{formatCurrency(totalSelectedValue)}</strong>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Nachfüllempfehlungen ({pendingRecommendations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRecommendations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Keine ausstehenden Empfehlungen</p>
              <p className="text-sm">
                Generieren Sie neue Empfehlungen oder alle Empfehlungen sind bereits verarbeitet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={pendingRecommendations.length > 0 && 
                          pendingRecommendations.every(rec => selectedRecommendations.includes(rec.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRecommendations(pendingRecommendations.map(rec => rec.id));
                          } else {
                            setSelectedRecommendations([]);
                          }
                        }}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead>Automat</TableHead>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Risiko</TableHead>
                    <TableHead>Bestand</TableHead>
                    <TableHead>MHD Tage</TableHead>
                    <TableHead>Empfohlen</TableHead>
                    <TableHead>Konfidenz</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRecommendations
                    .sort((a, b) => b.priorityScore - a.priorityScore)
                    .map((recommendation) => (
                    <TableRow key={recommendation.id} className="hover:bg-gray-50">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedRecommendations.includes(recommendation.id)}
                          onChange={() => toggleRecommendation(recommendation.id)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {recommendation.machineName}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate" title={recommendation.productName}>
                          {recommendation.productName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getRiskCategoryColor(recommendation.riskCategory)}`}
                        >
                          {getRiskIcon(recommendation.riskCategory)}
                          <span className="ml-1">{formatRiskCategory(recommendation.riskCategory)}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{recommendation.currentStock} Stück</div>
                          <div className="text-xs text-gray-500">
                            Ø {recommendation.avgDailySales.toFixed(1)}/Tag
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`text-sm font-medium ${
                          recommendation.daysUntilExpiry <= 3 ? 'text-red-600' :
                          recommendation.daysUntilExpiry <= 7 ? 'text-orange-600' :
                          'text-gray-700'
                        }`}>
                          {recommendation.daysUntilExpiry} Tage
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {recommendation.recommendedQuantity} Stück
                        </div>
                        <div className="text-xs text-gray-500">
                          ≈ {formatCurrency(recommendation.recommendedQuantity * 2.5)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {Math.round(recommendation.confidence * 100)}%
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Back Button */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Zurück zur Modusauswahl
        </Button>
        {selectedRecommendations.length > 0 && (
          <Button onClick={handleCreateOrder}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Bestellung mit {selectedRecommendations.length} Positionen erstellen
          </Button>
        )}
      </div>
    </div>
  );
};

export default MHDOrderComponent;