import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { DatePicker } from '@/components/ui/date-picker';

interface RefillsSyncTabProps {
  // Props here if needed  
}

export default function RefillsSyncTab({}: RefillsSyncTabProps) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().setDate(new Date().getDate() - 7))
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const refillSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/api/sync/refills', { 
        startDate: startDate ? startDate.toISOString().split('T')[0] : undefined,
        endDate: endDate ? endDate.toISOString().split('T')[0] : undefined
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: "Synchronisierung erfolgreich",
        description: `${data.saved} Auffüllungen synchronisiert.`,
        variant: "default",
      });
    },
    onError: (error) => {
      console.error('Fehler bei der Synchronisierung:', error);
      toast({
        title: "Synchronisierungsfehler",
        description: "Bei der Auffüllungen-Synchronisierung ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  });

  const handleSyncRefills = () => {
    refillSyncMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auffüllungen synchronisieren</CardTitle>
        <CardDescription>
          Gleicht die Auffüllungen (Refills) mit der Vendon-API ab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Startdatum</label>
              <DatePicker date={startDate} setDate={setStartDate} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Enddatum</label>
              <DatePicker date={endDate} setDate={setEndDate} />
            </div>
          </div>

          <Button
            onClick={handleSyncRefills}
            disabled={refillSyncMutation.isPending}
            className="w-full sm:w-auto"
          >
            {refillSyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Synchronisiere...
              </>
            ) : (
              'Auffüllungen synchronisieren'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}