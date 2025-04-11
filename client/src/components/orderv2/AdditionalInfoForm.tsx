import React from 'react';
import { Calendar as CalendarIcon, AlarmClock, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type AdditionalInfoFormProps = {
  additionalInfo: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
  };
  onAdditionalInfoChange: (additionalInfo: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
  }) => void;
};

const AdditionalInfoForm: React.FC<AdditionalInfoFormProps> = ({
  additionalInfo,
  onAdditionalInfoChange,
}) => {
  const handleDateChange = (date: Date | null) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      expectedDeliveryDate: date,
    });
  };

  const handlePriorityChange = (priority: string) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      priority,
    });
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      notes: e.target.value,
    });
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Lieferdetails</CardTitle>
          <CardDescription>
            Geben Sie zusätzliche Informationen zur Bestellung an.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="expected-delivery-date">Erwartetes Lieferdatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="expected-delivery-date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !additionalInfo.expectedDeliveryDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {additionalInfo.expectedDeliveryDate ? (
                    format(additionalInfo.expectedDeliveryDate, "PPP", { locale: de })
                  ) : (
                    <span>Wählen Sie ein Datum</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={additionalInfo.expectedDeliveryDate || undefined}
                  onSelect={(date) => handleDateChange(date || null)}
                  initialFocus
                  locale={de}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priorität</Label>
            <Select
              value={additionalInfo.priority}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger id="priority">
                <SelectValue placeholder="Priorität wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Niedrig</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Hoch</SelectItem>
                <SelectItem value="urgent">Dringend</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Anmerkungen</Label>
            <Textarea
              id="notes"
              placeholder="Zusätzliche Anmerkungen zur Bestellung..."
              value={additionalInfo.notes}
              onChange={handleNotesChange}
              className="min-h-[120px] resize-y"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liefertermine</CardTitle>
          <CardDescription>
            Tipps zur Lieferung und verfügbaren Terminen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <AlarmClock className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">Standard-Lieferzeit</p>
              <p className="text-sm text-muted-foreground">
                Die durchschnittliche Lieferzeit beträgt 3-5 Werktage ab dem Bestelldatum.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">Lieferdokumente</p>
              <p className="text-sm text-muted-foreground">
                Bitte stellen Sie sicher, dass die Lieferscheine bei Wareneingang vollständig und korrekt sind.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdditionalInfoForm;