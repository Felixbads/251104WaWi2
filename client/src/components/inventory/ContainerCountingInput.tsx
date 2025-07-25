import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calculator, Package, Zap } from 'lucide-react';

interface ContainerCountingInputProps {
  productName: string;
  packagingQuantity: number;
  packagingUnit: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  expectedContainers: number;
  expectedLooseItems: number;
  countedContainers: number;
  countedLooseItems: number;
  onCountedQuantityChange: (newQuantity: number) => void;
  onContainerCountChange: (containers: number, looseItems: number) => void;
}

export default function ContainerCountingInput({
  productName,
  packagingQuantity,
  packagingUnit,
  expectedQuantity,
  countedQuantity,
  expectedContainers,
  expectedLooseItems,
  countedContainers,
  countedLooseItems,
  onCountedQuantityChange,
  onContainerCountChange
}: ContainerCountingInputProps) {
  const [localContainers, setLocalContainers] = useState<string>(countedContainers.toString());
  const [localLooseItems, setLocalLooseItems] = useState<string>(countedLooseItems.toString());
  const [localTotalQuantity, setLocalTotalQuantity] = useState<string>(countedQuantity?.toString() || '');

  // Berechne Gesamtmenge aus Gebinden und losen Einheiten
  const calculateTotalFromContainers = (containers: number, loose: number): number => {
    return (containers * packagingQuantity) + loose;
  };

  // Berechne Gebinde und lose Einheiten aus Gesamtmenge
  const calculateContainersFromTotal = (total: number): { containers: number; loose: number } => {
    const containers = Math.floor(total / packagingQuantity);
    const loose = total % packagingQuantity;
    return { containers, loose };
  };

  // Handler für Änderungen bei Gebinden
  const handleContainerChange = (value: string) => {
    setLocalContainers(value);
    const containers = parseInt(value) || 0;
    const loose = parseInt(localLooseItems) || 0;
    
    const newTotal = calculateTotalFromContainers(containers, loose);
    setLocalTotalQuantity(newTotal.toString());
    
    onContainerCountChange(containers, loose);
    onCountedQuantityChange(newTotal);
  };

  // Handler für Änderungen bei losen Einheiten
  const handleLooseItemsChange = (value: string) => {
    setLocalLooseItems(value);
    const containers = parseInt(localContainers) || 0;
    const loose = parseInt(value) || 0;
    
    const newTotal = calculateTotalFromContainers(containers, loose);
    setLocalTotalQuantity(newTotal.toString());
    
    onContainerCountChange(containers, loose);
    onCountedQuantityChange(newTotal);
  };

  // Handler für Änderungen bei Gesamtmenge
  const handleTotalQuantityChange = (value: string) => {
    setLocalTotalQuantity(value);
    const total = parseInt(value) || 0;
    
    const { containers, loose } = calculateContainersFromTotal(total);
    setLocalContainers(containers.toString());
    setLocalLooseItems(loose.toString());
    
    onContainerCountChange(containers, loose);
    onCountedQuantityChange(total);
  };

  // Berechnungen für Differenzen
  const totalDifference = (parseInt(localTotalQuantity) || 0) - expectedQuantity;
  const containerDifference = (parseInt(localContainers) || 0) - expectedContainers;
  const looseDifference = (parseInt(localLooseItems) || 0) - expectedLooseItems;

  const getDifferenceColor = (diff: number) => {
    if (diff === 0) return 'text-green-600';
    if (diff > 0) return 'text-blue-600';
    return 'text-red-600';
  };

  const getDifferenceBadgeVariant = (diff: number) => {
    if (diff === 0) return 'default';
    if (diff > 0) return 'secondary';
    return 'destructive';
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Gebinde-Zählung: {productName}
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          Gebindegröße: {packagingQuantity} {packagingUnit} pro Gebinde
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Soll-Ist Vergleich */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="text-center">
            <div className="font-medium text-muted-foreground">Erwartet</div>
            <div className="font-bold">{expectedContainers} + {expectedLooseItems}</div>
            <div className="text-muted-foreground">= {expectedQuantity} gesamt</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-muted-foreground">Gezählt</div>
            <div className="font-bold">{parseInt(localContainers) || 0} + {parseInt(localLooseItems) || 0}</div>
            <div className="text-muted-foreground">= {parseInt(localTotalQuantity) || 0} gesamt</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-muted-foreground">Differenz</div>
            <div className={`font-bold ${getDifferenceColor(totalDifference)}`}>
              {totalDifference > 0 ? '+' : ''}{totalDifference}
            </div>
            <Badge variant={getDifferenceBadgeVariant(totalDifference)} className="text-xs">
              {totalDifference === 0 ? 'Korrekt' : totalDifference > 0 ? 'Überschuss' : 'Fehlbestand'}
            </Badge>
          </div>
        </div>

        {/* Eingabefelder für Container-Zählung */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="containers" className="text-xs font-medium">
              Gebinde ({packagingUnit})
            </Label>
            <Input
              id="containers"
              type="number"
              min="0"
              value={localContainers}
              onChange={(e) => handleContainerChange(e.target.value)}
              placeholder="0"
              className="text-center font-mono"
            />
            <div className={`text-xs mt-1 ${getDifferenceColor(containerDifference)}`}>
              Differenz: {containerDifference > 0 ? '+' : ''}{containerDifference}
            </div>
          </div>
          
          <div>
            <Label htmlFor="loose-items" className="text-xs font-medium">
              Einzelstücke
            </Label>
            <Input
              id="loose-items"
              type="number"
              min="0"
              max={packagingQuantity - 1}
              value={localLooseItems}
              onChange={(e) => handleLooseItemsChange(e.target.value)}
              placeholder="0"
              className="text-center font-mono"
            />
            <div className={`text-xs mt-1 ${getDifferenceColor(looseDifference)}`}>
              Differenz: {looseDifference > 0 ? '+' : ''}{looseDifference}
            </div>
          </div>
        </div>

        {/* Alternative: Direkte Gesamtmenge-Eingabe */}
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-3 w-3" />
            <Label htmlFor="total-quantity" className="text-xs font-medium">
              Oder Gesamtmenge direkt eingeben:
            </Label>
          </div>
          <Input
            id="total-quantity"
            type="number"
            min="0"
            value={localTotalQuantity}
            onChange={(e) => handleTotalQuantityChange(e.target.value)}
            placeholder="0"
            className="text-center font-mono"
          />
          <div className="text-xs mt-1 text-muted-foreground">
            Wird automatisch in Gebinde + Einzelstücke aufgeteilt
          </div>
        </div>
      </CardContent>
    </Card>
  );
}