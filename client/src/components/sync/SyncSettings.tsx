import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export default function SyncSettings() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(30);

  // Load current settings
  const settingsQuery = useQuery({
    queryKey: ['/api/sync/settings'],
    queryFn: async () => {
      const response = await axios.get('/api/sync/settings');
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        setAutoSync(data.autoSync !== false);
        setSyncInterval(data.syncInterval || 30);
      }
    }
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const settings = {
        apiKey: apiKey || undefined,
        autoSync,
        syncInterval
      };
      const response = await axios.post('/api/sync/settings', settings);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Einstellungen gespeichert",
        description: "Die Synchronisierungs-Einstellungen wurden erfolgreich aktualisiert.",
        variant: "default",
      });
      setApiKey(''); // Clear API key input after saving
    },
    onError: (error) => {
      console.error('Fehler beim Speichern der Einstellungen:', error);
      toast({
        title: "Fehler",
        description: "Die Einstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  });

  const handleSave = () => {
    saveSettingsMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Synchronisierungseinstellungen</CardTitle>
        <CardDescription>
          Konfigurieren Sie die API-Verbindung und Synchronisierungsparameter
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium">
              Vendon API-Schlüssel (leer lassen, um den bestehenden zu behalten)
            </label>
            <Input
              id="api-key"
              type="password"
              placeholder="API-Schlüssel eingeben..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="auto-sync" className="text-sm font-medium">
              Automatische Synchronisierung
            </label>
            <Switch
              id="auto-sync"
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="sync-interval" className="text-sm font-medium">
              Synchronisierungsintervall (Minuten)
            </label>
            <Input
              id="sync-interval"
              type="number"
              min="5"
              max="1440"
              value={syncInterval}
              onChange={(e) => setSyncInterval(parseInt(e.target.value))}
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={saveSettingsMutation.isPending}
            className="w-full sm:w-auto"
          >
            {saveSettingsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Speichere...
              </>
            ) : (
              'Einstellungen speichern'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}