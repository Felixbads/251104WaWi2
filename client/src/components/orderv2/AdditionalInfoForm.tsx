import React from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { 
  Popover, 
  PopoverTrigger, 
  PopoverContent 
} from "@/components/ui/popover";
import { 
  RadioGroup, 
  RadioGroupItem 
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { 
  Alert, 
  AlertDescription, 
  AlertTitle 
} from "@/components/ui/alert";

type AdditionalInfoProps = {
  additionalInfo: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
  };
  onAdditionalInfoChange: (info: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
  }) => void;
};

const AdditionalInfoForm: React.FC<AdditionalInfoProps> = ({
  additionalInfo,
  onAdditionalInfoChange
}) => {
  // Minimum date for delivery (today)
  const today = new Date();
  
  // Handle date change
  const handleDateChange = (date: Date | undefined) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      expectedDeliveryDate: date || null
    });
  };
  
  // Handle priority change
  const handlePriorityChange = (value: string) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      priority: value
    });
  };
  
  // Handle notes change
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      notes: e.target.value
    });
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Date Selection */}
            <div className="space-y-2">
              <Label htmlFor="delivery-date">Gewünschter Liefertermin <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="delivery-date"
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
                      <span>Lieferdatum auswählen</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={additionalInfo.expectedDeliveryDate || undefined}
                    onSelect={handleDateChange}
                    disabled={(date) => date < today}
                    initialFocus
                    locale={de}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-sm text-muted-foreground">
                Wählen Sie das gewünschte Lieferdatum für diese Bestellung.
              </p>
            </div>
            
            {/* Priority Selection */}
            <div className="space-y-2">
              <Label>Priorität</Label>
              <RadioGroup 
                value={additionalInfo.priority} 
                onValueChange={handlePriorityChange}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="normal" id="normal" />
                  <Label htmlFor="normal" className="font-normal">Normal</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="high" id="high" />
                  <Label htmlFor="high" className="font-normal">Hoch</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="urgent" id="urgent" />
                  <Label htmlFor="urgent" className="font-normal">Dringend</Label>
                </div>
              </RadioGroup>
              <p className="text-sm text-muted-foreground">
                Die Priorität wird dem Lieferanten mitgeteilt.
              </p>
            </div>
          </div>
          
          {/* Notes */}
          <div className="mt-6 space-y-2">
            <Label htmlFor="notes">Anmerkungen und Hinweise</Label>
            <Textarea
              id="notes"
              placeholder="Zusätzliche Informationen zur Bestellung..."
              value={additionalInfo.notes}
              onChange={handleNotesChange}
              rows={4}
            />
            <p className="text-sm text-muted-foreground">
              Spezielle Anmerkungen, Lieferhinweise oder andere wichtige Informationen für den Lieferanten.
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* Info about delivery date */}
      {!additionalInfo.expectedDeliveryDate && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Wichtig</AlertTitle>
          <AlertDescription>
            Bitte wählen Sie einen gewünschten Liefertermin aus, um fortfahren zu können.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default AdditionalInfoForm;