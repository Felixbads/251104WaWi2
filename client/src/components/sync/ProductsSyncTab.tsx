import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface ProductsSyncTabProps {
  // Props here if needed
}

export default function ProductsSyncTab({}: ProductsSyncTabProps) {
  const { toast } = useToast();
  const [forceUpdate, setForceUpdate] = useState(false);

  const productSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/api/sync/products', { forceUpdate });
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: "Synchronisierung erfolgreich",
        description: `${data.saved} Produkte synchronisiert, ${data.updated} aktualisiert.`,
        variant: "default",
      });
    },
    onError: (error) => {
      console.error('Fehler bei der Synchronisierung:', error);
      toast({
        title: "Synchronisierungsfehler",
        description: "Bei der Produkt-Synchronisierung ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  });

  const handleSyncProducts = () => {
    productSyncMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produkte synchronisieren</CardTitle>
        <CardDescription>
          Gleicht die Produktdaten mit der Vendon-API ab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="forceUpdate"
              checked={forceUpdate}
              onChange={(e) => setForceUpdate(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="forceUpdate" className="text-sm font-medium">
              Auch bereits synchronisierte Produkte aktualisieren
            </label>
          </div>

          <Button
            onClick={handleSyncProducts}
            disabled={productSyncMutation.isPending}
            className="w-full sm:w-auto"
          >
            {productSyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Synchronisiere...
              </>
            ) : (
              'Produkte synchronisieren'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}