import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clipboard, CopyPlus, Boxes, LineChart, CheckCircle2 } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

// Export type for OrderMode
export type OrderMode = 'new' | 'copy' | 'forecast';

interface OrderModeSelectorProps {
  mode: OrderMode;
  onSelectMode: (mode: OrderMode) => void;
  sourceOrderId?: number | null;
  onSourceOrderChange?: (id: number) => void;
}

const OrderModeSelector: React.FC<OrderModeSelectorProps> = ({
  mode,
  onSelectMode,
  sourceOrderId,
  onSourceOrderChange
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bestellmodus wählen</CardTitle>
        <CardDescription>
          Wählen Sie, wie Sie die Bestellung erstellen möchten.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Neue Bestellung */}
          <Card className={`cursor-pointer border-2 ${mode === 'new' ? 'border-primary' : 'border-border'}`}>
            <CardContent className="pt-6" onClick={() => onSelectMode('new')}>
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clipboard className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-center font-medium text-lg mb-2">Neue Bestellung</h3>
              <p className="text-center text-sm text-muted-foreground">
                Erstellen Sie eine neue Bestellung von Grund auf.
              </p>
              
              {mode === 'new' && (
                <div className="mt-4 flex justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Bestellung kopieren */}
          <Card className={`cursor-pointer border-2 ${mode === 'copy' ? 'border-primary' : 'border-border'}`}>
            <CardContent className="pt-6" onClick={() => onSelectMode('copy')}>
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <CopyPlus className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-center font-medium text-lg mb-2">Bestellung kopieren</h3>
              <p className="text-center text-sm text-muted-foreground">
                Kopieren Sie eine bestehende Bestellung als Vorlage.
              </p>
              
              {mode === 'copy' && (
                <div className="mt-4 flex justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Bestellung auf Basis von Prognose */}
          <Card className={`cursor-pointer border-2 ${mode === 'forecast' ? 'border-primary' : 'border-border'}`}>
            <CardContent className="pt-6" onClick={() => onSelectMode('forecast')}>
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <LineChart className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-center font-medium text-lg mb-2">Auf Basis von Prognose</h3>
              <p className="text-center text-sm text-muted-foreground">
                Erstellen Sie eine Bestellung auf Basis von Verbrauchsprognosen.
              </p>
              
              {mode === 'forecast' && (
                <div className="mt-4 flex justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Bestellvorlagen */}
        {mode === 'copy' && (
          <div className="mt-6">
            <h3 className="font-medium text-lg mb-4">Bestellung als Vorlage auswählen</h3>
            <div className="bg-muted p-4 rounded-md text-muted-foreground text-center">
              Dieses Feature wird in einer zukünftigen Version verfügbar sein.
            </div>
          </div>
        )}
        
        {/* Prognosemodelle */}
        {mode === 'forecast' && (
          <div className="mt-6">
            <h3 className="font-medium text-lg mb-4">Prognosemodell auswählen</h3>
            <div className="bg-muted p-4 rounded-md text-muted-foreground text-center">
              Dieses Feature wird in einer zukünftigen Version verfügbar sein.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderModeSelector;