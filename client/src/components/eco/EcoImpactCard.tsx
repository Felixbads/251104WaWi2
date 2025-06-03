import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Leaf, 
  Droplets, 
  Recycle, 
  Truck, 
  Award,
  TreePine,
  Sprout
} from 'lucide-react';

interface EcoImpactCardProps {
  product: {
    id: number;
    productName: string;
    price: number;
    carbonFootprint?: number;
    waterUsage?: number;
    packagingType?: string;
    packagingRecyclable?: boolean;
    transportDistance?: number;
    isOrganic?: boolean;
    isLocal?: boolean;
    isVegan?: boolean;
    isVegetarian?: boolean;
    sustainabilityScore?: number;
    certifications?: string;
  };
  showComparison?: boolean;
  comparisonData?: {
    avgCarbonFootprint: number;
    avgWaterUsage: number;
    avgSustainabilityScore: number;
  };
}

export function EcoImpactCard({ product, showComparison = false, comparisonData }: EcoImpactCardProps) {
  const certifications = product.certifications ? JSON.parse(product.certifications) : [];
  const sustainabilityScore = product.sustainabilityScore || 0;
  
  const getSustainabilityColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getSustainabilityLabel = (score: number) => {
    if (score >= 90) return 'Ausgezeichnet';
    if (score >= 70) return 'Gut';
    if (score >= 50) return 'Durchschnittlich';
    return 'Verbesserungsbedürftig';
  };

  const formatCertifications = (cert: string) => {
    const certMap: { [key: string]: string } = {
      'bio': 'Bio',
      'regional': 'Regional',
      'vegan': 'Vegan',
      'recyclable': 'Recyclebar',
      'fairtrade': 'Fairtrade',
      'compostable': 'Kompostierbar'
    };
    return certMap[cert] || cert;
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>{product.productName}</span>
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-green-600" />
            <span className={`text-lg font-bold ${getSustainabilityColor(sustainabilityScore)}`}>
              {sustainabilityScore.toFixed(0)}
            </span>
          </div>
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{product.price.toFixed(2)} €</span>
          <Badge variant={sustainabilityScore >= 70 ? "default" : "secondary"}>
            {getSustainabilityLabel(sustainabilityScore)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Sustainability Score Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Nachhaltigkeitsbewertung</span>
            <span className={getSustainabilityColor(sustainabilityScore)}>
              {sustainabilityScore.toFixed(0)}/100
            </span>
          </div>
          <Progress value={sustainabilityScore} className="h-2" />
        </div>

        {/* Environmental Impact Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TreePine className="h-4 w-4" />
              CO₂-Fußabdruck
            </div>
            <div className="text-lg font-semibold">
              {product.carbonFootprint?.toFixed(3) || '0.000'} kg
            </div>
            {showComparison && comparisonData && (
              <div className="text-xs text-muted-foreground">
                Ø: {comparisonData.avgCarbonFootprint.toFixed(3)} kg
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Droplets className="h-4 w-4" />
              Wasserverbrauch
            </div>
            <div className="text-lg font-semibold">
              {product.waterUsage?.toFixed(1) || '0.0'} L
            </div>
            {showComparison && comparisonData && (
              <div className="text-xs text-muted-foreground">
                Ø: {comparisonData.avgWaterUsage.toFixed(1)} L
              </div>
            )}
          </div>
        </div>

        {/* Packaging and Transport */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Recycle className="h-4 w-4" />
              Verpackung
            </div>
            <div className="text-sm font-medium capitalize">
              {product.packagingType || 'Unbekannt'}
            </div>
            {product.packagingRecyclable && (
              <Badge variant="outline" className="text-xs">
                Recyclebar
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="h-4 w-4" />
              Transport
            </div>
            <div className="text-sm font-medium">
              {product.transportDistance?.toFixed(0) || '0'} km
            </div>
            {product.isLocal && (
              <Badge variant="outline" className="text-xs">
                Regional
              </Badge>
            )}
          </div>
        </div>

        {/* Diet and Lifestyle Badges */}
        <div className="flex flex-wrap gap-2">
          {product.isOrganic && (
            <Badge variant="outline" className="text-green-700 border-green-300">
              <Sprout className="h-3 w-3 mr-1" />
              Bio
            </Badge>
          )}
          {product.isVegan && (
            <Badge variant="outline" className="text-green-700 border-green-300">
              Vegan
            </Badge>
          )}
          {product.isVegetarian && !product.isVegan && (
            <Badge variant="outline" className="text-blue-700 border-blue-300">
              Vegetarisch
            </Badge>
          )}
          {product.isLocal && (
            <Badge variant="outline" className="text-orange-700 border-orange-300">
              Regional
            </Badge>
          )}
        </div>

        {/* Certifications */}
        {certifications.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Award className="h-4 w-4" />
              Zertifizierungen
            </div>
            <div className="flex flex-wrap gap-1">
              {certifications.map((cert: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {formatCertifications(cert)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Environmental Savings Comparison */}
        {showComparison && comparisonData && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2">Umweltauswirkung vs. Durchschnitt</div>
            <div className="space-y-1">
              {product.carbonFootprint && product.carbonFootprint < comparisonData.avgCarbonFootprint && (
                <div className="text-xs text-green-600">
                  ✓ {((comparisonData.avgCarbonFootprint - product.carbonFootprint) * 1000).toFixed(0)}g CO₂ weniger
                </div>
              )}
              {product.waterUsage && product.waterUsage < comparisonData.avgWaterUsage && (
                <div className="text-xs text-blue-600">
                  ✓ {(comparisonData.avgWaterUsage - product.waterUsage).toFixed(1)}L Wasser gespart
                </div>
              )}
              {sustainabilityScore > comparisonData.avgSustainabilityScore && (
                <div className="text-xs text-green-600">
                  ✓ {(sustainabilityScore - comparisonData.avgSustainabilityScore).toFixed(0)} Punkte nachhaltiger
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}