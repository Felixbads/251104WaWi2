import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AdditionalInfoFormProps {
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
}

const AdditionalInfoForm: React.FC<AdditionalInfoFormProps> = ({
  additionalInfo,
  onAdditionalInfoChange
}) => {
  // Update expected delivery date
  const handleDateChange = (date: Date | undefined) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      expectedDeliveryDate: date || null
    });
  };
  
  // Update priority
  const handlePriorityChange = (value: string) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      priority: value
    });
  };
  
  // Update notes
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onAdditionalInfoChange({
      ...additionalInfo,
      notes: e.target.value
    });
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Zusätzliche Informationen</CardTitle>
        <CardDescription>
          Fügen Sie wichtige Details zu Ihrer Bestellung hinzu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Expected Delivery Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Erwartetes Lieferdatum</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !additionalInfo.expectedDeliveryDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {additionalInfo.expectedDeliveryDate ? (
                  format(additionalInfo.expectedDeliveryDate, 'PPP', { locale: de })
                ) : (
                  <span>Datum auswählen</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={additionalInfo.expectedDeliveryDate || undefined}
                onSelect={handleDateChange}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Priority */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Priorität</label>
          <Select
            value={additionalInfo.priority}
            onValueChange={handlePriorityChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Priorität auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Niedrig</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">Hoch</SelectItem>
              <SelectItem value="urgent">Dringend</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Notes */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Notizen für den Lieferanten</label>
          <Textarea
            placeholder="Fügen Sie hier spezielle Anweisungen oder Notizen für den Lieferanten hinzu."
            value={additionalInfo.notes}
            onChange={handleNotesChange}
            rows={5}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default AdditionalInfoForm;