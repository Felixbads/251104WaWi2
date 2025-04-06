import { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function DemoBatchesCreator() {
  const [isCreatingBatches, setIsCreatingBatches] = useState(false);
  const [isCreatingMovements, setIsCreatingMovements] = useState(false);
  const [batchesCreated, setBatchesCreated] = useState(false);
  const [movementsCreated, setMovementsCreated] = useState(false);

  const createDemoBatches = async () => {
    try {
      setIsCreatingBatches(true);
      const response = await axios.post('/api/product-batches/seed');
      toast({
        title: 'Demo-Batches erstellt',
        description: `${response.data.batches.length} Beispiel-Batches wurden erfolgreich erstellt.`,
        variant: 'success',
      });
      setBatchesCreated(true);
    } catch (error) {
      console.error('Fehler beim Erstellen von Demo-Batches:', error);
      toast({
        title: 'Fehler',
        description: 'Die Demo-Batches konnten nicht erstellt werden. Bitte versuchen Sie es später erneut.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingBatches(false);
    }
  };

  const createDemoMovements = async () => {
    try {
      setIsCreatingMovements(true);
      const response = await axios.post('/api/product-batches/create-demo-movements');
      toast({
        title: 'Demo-Warenbewegungen erstellt',
        description: `${response.data.movements.length} Beispiel-Warenbewegungen wurden erfolgreich erstellt.`,
        variant: 'success',
      });
      setMovementsCreated(true);
    } catch (error) {
      console.error('Fehler beim Erstellen von Demo-Warenbewegungen:', error);
      toast({
        title: 'Fehler',
        description: 'Die Demo-Warenbewegungen konnten nicht erstellt werden. Bitte versuchen Sie es später erneut.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingMovements(false);
    }
  };

  const resetState = () => {
    setBatchesCreated(false);
    setMovementsCreated(false);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Demo-Daten erstellen</CardTitle>
        <CardDescription>
          Erstellen Sie Demo-Daten für Batches und Warenbewegungen. Diese Funktion ist nur zu Testzwecken gedacht.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">1. Batch-Daten</h3>
              <p className="text-sm text-muted-foreground">Erstellt Beispiel-Batches für Produkte mit Ablaufdaten.</p>
            </div>
            <Button 
              onClick={createDemoBatches} 
              disabled={isCreatingBatches || batchesCreated || isCreatingMovements}
              variant={batchesCreated ? "outline" : "default"}
            >
              {isCreatingBatches ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Erstelle...
                </>
              ) : batchesCreated ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Erstellt
                </>
              ) : (
                'Batches erstellen'
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">2. Warenbewegungen</h3>
              <p className="text-sm text-muted-foreground">
                Erstellt Beispiel-Warenbewegungen für die vorhandenen Batches (Eingang, Ausgang, etc.).
              </p>
            </div>
            <Button 
              onClick={createDemoMovements} 
              disabled={isCreatingMovements || !batchesCreated || movementsCreated || isCreatingBatches}
              variant={movementsCreated ? "outline" : "default"}
            >
              {isCreatingMovements ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Erstelle...
                </>
              ) : movementsCreated ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Erstellt
                </>
              ) : (
                'Warenbewegungen erstellen'
              )}
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={resetState} 
          variant="outline" 
          className="ml-auto"
          disabled={isCreatingBatches || isCreatingMovements || (!batchesCreated && !movementsCreated)}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Zurücksetzen
        </Button>
      </CardFooter>
    </Card>
  );
}