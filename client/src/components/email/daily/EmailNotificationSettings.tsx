import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Save, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface EmailSettings {
  id?: number;
  enabled: boolean;
  weekdayMask: boolean[];
  sendTime: string;
  templateId?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export const EmailNotificationSettings: React.FC = () => {
  const [settings, setSettings] = useState<EmailSettings>({
    enabled: false,
    weekdayMask: [false, true, true, true, true, true, false], // Mo-Fr default
    sendTime: '06:00',
  });
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lade aktuelle Einstellungen
  const { data: currentSettings, isLoading } = useQuery({
    queryKey: ['/api/email/daily/settings'],
    select: (data: any) => data?.data,
  });

  // Validiere Konfiguration
  const { data: validation, refetch: refetchValidation } = useQuery({
    queryKey: ['/api/email/daily/validate'],
    select: (data: any) => data?.data as ValidationResult,
  });

  // Speichere Einstellungen
  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: EmailSettings) => {
      const url = currentSettings?.id 
        ? `/api/email/daily/settings/${currentSettings.id}`
        : '/api/email/daily/settings';
      
      const response = await fetch(url, {
        method: currentSettings?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Speichern der Einstellungen');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Einstellungen gespeichert",
        description: "Die E-Mail-Einstellungen wurden erfolgreich gespeichert.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/daily/settings'] });
      refetchValidation();
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettingsMutation.mutateAsync(settings);
    } finally {
      setIsSaving(false);
    }
  };

  const handleWeekdayChange = (dayIndex: number, enabled: boolean) => {
    const newWeekdayMask = [...settings.weekdayMask];
    newWeekdayMask[dayIndex] = enabled;
    setSettings({ ...settings, weekdayMask: newWeekdayMask });
  };

  if (isLoading) {
    return <div>Lade Einstellungen...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Konfigurationsvalidierung */}
      {validation && (
        <Alert className={validation.isValid ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-2">
              Konfigurationsstatus: {validation.isValid ? 
                <span className="text-green-600">✓ Gültig</span> : 
                <span className="text-orange-600">⚠ Unvollständig</span>
              }
            </div>
            {validation.issues.length > 0 && (
              <ul className="list-disc list-inside space-y-1 text-sm">
                {validation.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Grundeinstellungen
          </CardTitle>
          <CardDescription>
            Konfigurieren Sie die automatischen täglichen E-Mail-Benachrichtigungen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* E-Mail-Benachrichtigungen aktivieren */}
          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={settings.enabled}
              onCheckedChange={(enabled) => setSettings({ ...settings, enabled })}
            />
            <Label htmlFor="enabled" className="text-sm font-medium">
              Tägliche E-Mail-Benachrichtigungen aktivieren
            </Label>
          </div>

          {/* Versendungszeit */}
          <div className="space-y-2">
            <Label htmlFor="sendTime">Versendungszeit</Label>
            <Input
              id="sendTime"
              type="time"
              value={settings.sendTime}
              onChange={(e) => setSettings({ ...settings, sendTime: e.target.value })}
              className="w-32"
            />
            <p className="text-sm text-muted-foreground">
              Uhrzeit für den automatischen Versand (Zeitzone: Europe/Berlin)
            </p>
          </div>

          {/* Wochentage */}
          <div className="space-y-3">
            <Label>Versendungstage</Label>
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((day, index) => (
                <div key={index} className="flex flex-col items-center space-y-2">
                  <Label htmlFor={`day-${index}`} className="text-xs font-medium">
                    {day.slice(0, 2)}
                  </Label>
                  <Switch
                    id={`day-${index}`}
                    checked={settings.weekdayMask[index]}
                    onCheckedChange={(enabled) => handleWeekdayChange(index, enabled)}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Wählen Sie die Wochentage aus, an denen E-Mails versendet werden sollen
            </p>
          </div>

          {/* Speichern Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Speichern...' : 'Einstellungen speichern'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};