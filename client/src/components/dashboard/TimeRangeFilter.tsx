import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Clock } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears } from 'date-fns';
import { de } from 'date-fns/locale';

export type TimeRange = {
  label: string;
  value: string;
  startDate: Date;
  endDate: Date;
}

export type CustomTimeRange = {
  startDate: Date;
  endDate: Date;
}

type TimeRangeFilterProps = {
  onChange: (range: TimeRange | CustomTimeRange) => void;
  selectedRange?: string;
  className?: string;
  showIcon?: boolean;
  compact?: boolean;
}

export const TIME_RANGES = [
  {
    label: 'Heute',
    value: 'today',
    startDate: startOfDay(new Date()),
    endDate: endOfDay(new Date())
  },
  {
    label: 'Gestern',
    value: 'yesterday',
    startDate: startOfDay(subDays(new Date(), 1)),
    endDate: endOfDay(subDays(new Date(), 1))
  },
  {
    label: 'Letzte 24 Stunden',
    value: 'last24hours',
    startDate: subDays(new Date(), 1),
    endDate: new Date()
  },
  {
    label: 'Diese Woche',
    value: 'thisWeek',
    startDate: startOfWeek(new Date(), { weekStartsOn: 1 }),
    endDate: endOfWeek(new Date(), { weekStartsOn: 1 })
  },
  {
    label: 'Letzte 7 Tage',
    value: 'last7days',
    startDate: subDays(new Date(), 7),
    endDate: new Date()
  },
  {
    label: 'Dieser Monat',
    value: 'thisMonth',
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date())
  },
  {
    label: 'Letzter Monat',
    value: 'lastMonth',
    startDate: startOfMonth(subMonths(new Date(), 1)),
    endDate: endOfMonth(subMonths(new Date(), 1))
  },
  {
    label: 'Dieses Jahr',
    value: 'thisYear',
    startDate: startOfYear(new Date()),
    endDate: endOfYear(new Date())
  },
  {
    label: 'Letztes Jahr',
    value: 'lastYear',
    startDate: startOfYear(subYears(new Date(), 1)),
    endDate: endOfYear(subYears(new Date(), 1))
  },
  {
    label: 'Letzte 12 Monate',
    value: 'last12months',
    startDate: subMonths(new Date(), 12),
    endDate: new Date()
  },
  {
    label: 'Benutzerdefiniert',
    value: 'custom',
    startDate: subDays(new Date(), 30),
    endDate: new Date()
  }
];

const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({ 
  onChange, 
  selectedRange = 'last7days',
  className = '',
  showIcon = true,
  compact = false
}) => {
  const [customRange, setCustomRange] = React.useState<{
    startDate: Date;
    endDate: Date;
  }>({
    startDate: subDays(new Date(), 30),
    endDate: new Date()
  });

  const handleTimeRangeChange = (value: string) => {
    const selectedTimeRange = TIME_RANGES.find(range => range.value === value);
    if (selectedTimeRange) {
      if (value === 'custom') {
        onChange({ 
          startDate: customRange.startDate, 
          endDate: customRange.endDate 
        });
      } else {
        onChange(selectedTimeRange);
      }
    }
  };

  const handleCustomRangeChange = (type: 'start' | 'end', date: Date | undefined) => {
    if (!date) return;
    
    const newRange = {
      ...customRange,
      [type === 'start' ? 'startDate' : 'endDate']: date
    };
    
    setCustomRange(newRange);
    
    if (selectedRange === 'custom') {
      onChange(newRange);
    }
  };

  const getTimeRangeDisplay = () => {
    const range = TIME_RANGES.find(r => r.value === selectedRange);
    if (!range) return '';
    
    if (selectedRange === 'custom') {
      return `${format(customRange.startDate, 'dd.MM.yyyy')} - ${format(customRange.endDate, 'dd.MM.yyyy')}`;
    }
    
    return range.label;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && <Clock className="h-4 w-4 text-muted-foreground" />}
      
      <Select
        value={selectedRange}
        onValueChange={handleTimeRangeChange}
      >
        <SelectTrigger className={`${compact ? 'h-8 text-sm' : ''}`}>
          <SelectValue placeholder="Zeitraum auswählen">
            {getTimeRangeDisplay()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGES.map((range) => (
            <SelectItem key={range.value} value={range.value}>
              {range.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedRange === 'custom' && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size={compact ? "sm" : "default"}
                className={`justify-start text-left font-normal ${compact ? 'h-8 text-sm' : ''}`}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(customRange.startDate, 'dd.MM.yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={customRange.startDate}
                onSelect={(date) => handleCustomRangeChange('start', date)}
                initialFocus
                locale={de}
              />
            </PopoverContent>
          </Popover>
          
          <span className="text-muted-foreground">-</span>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size={compact ? "sm" : "default"}
                className={`justify-start text-left font-normal ${compact ? 'h-8 text-sm' : ''}`}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(customRange.endDate, 'dd.MM.yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={customRange.endDate}
                onSelect={(date) => handleCustomRangeChange('end', date)}
                initialFocus
                locale={de}
                fromDate={customRange.startDate}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};

export default TimeRangeFilter;