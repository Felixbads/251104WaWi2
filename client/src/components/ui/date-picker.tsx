import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { de } from 'date-fns/locale'

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Deutsche Lokalisierung für den Datepicker
const germanLocalization = {
  locale: de,
  months: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni", 
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
  weekdays: [
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag"
  ],
}

interface DatePickerProps {
  date: Date | null | undefined
  setDate: (date: Date | null) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export function DatePicker({ 
  date, 
  setDate, 
  className,
  placeholder = "Datum auswählen",
  disabled = false
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd.MM.yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date || undefined}
          onSelect={setDate}
          locale={germanLocalization.locale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}