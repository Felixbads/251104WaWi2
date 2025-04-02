import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface MachinesSyncTabProps {
  // Props here if needed
}

export default function MachinesSyncTab({}: MachinesSyncTabProps) {
  const { toast } = useToast();
  const [forceUpdate, setForceUpdate] = useState(false);

  const machineSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/api/sync/machines', { forceUpdate });
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: "Synchronisierung erfolgreich",
        description: `${data.saved} Automaten synchronisiert, ${data.updated} aktualisiert.`,
        variant: "default",
      });
    },
    onError: (error) => {
      console.error('Fehler bei der Synchronisierung:', error);
      toast({
        title: "Synchronisierungsfehler",
        description: "Bei der Automaten-Synchronisierung ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  });

  const handleSyncMachines = () => {
    machineSyncMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automaten synchronisieren</CardTitle>
        <CardDescription>
          Gleicht die Automatendaten mit der Vendon-API ab.
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
              Auch bereits synchronisierte Automaten aktualisieren
            </label>
          </div>

          <Button
            onClick={handleSyncMachines}
            disabled={machineSyncMutation.isPending}
            className="w-full sm:w-auto"
          >
            {machineSyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Synchronisiere...
              </>
            ) : (
              'Automaten synchronisieren'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}