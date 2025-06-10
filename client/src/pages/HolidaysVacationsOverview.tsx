/**
 * Holidays and Vacations Overview Page
 * 
 * Displays a comprehensive table with dates, holiday names, and status per federal state
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar, Search, Download, Filter, Calendar as CalendarIcon } from 'lucide-react';
import { format, parse, startOfYear, endOfYear } from 'date-fns';
import { de } from 'date-fns/locale';

// German federal states
const GERMAN_STATES = [
  { code: 'BW', name: 'Baden-Württemberg', short: 'BW' },
  { code: 'BY', name: 'Bayern', short: 'BY' },
  { code: 'BE', name: 'Berlin', short: 'BE' },
  { code: 'BB', name: 'Brandenburg', short: 'BB' },
  { code: 'HB', name: 'Bremen', short: 'HB' },
  { code: 'HH', name: 'Hamburg', short: 'HH' },
  { code: 'HE', name: 'Hessen', short: 'HE' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern', short: 'MV' },
  { code: 'NI', name: 'Niedersachsen', short: 'NI' },
  { code: 'NW', name: 'Nordrhein-Westfalen', short: 'NW' },
  { code: 'RP', name: 'Rheinland-Pfalz', short: 'RP' },
  { code: 'SL', name: 'Saarland', short: 'SL' },
  { code: 'SN', name: 'Sachsen', short: 'SN' },
  { code: 'ST', name: 'Sachsen-Anhalt', short: 'ST' },
  { code: 'SH', name: 'Schleswig-Holstein', short: 'SH' },
  { code: 'TH', name: 'Thüringen', short: 'TH' }
];

interface HolidayData {
  date: string;
  name: string;
  type: 'public_holiday' | 'school_holiday';
  states: {
    [stateCode: string]: {
      isHoliday: boolean;
      isSchoolHoliday: boolean;
      holidayName?: string;
      schoolHolidayName?: string;
    };
  };
}

export default function HolidaysVacationsOverview() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public_holiday' | 'school_holiday'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  // Fetch holidays and school holidays data
  const { data: holidaysData, isLoading } = useQuery<HolidayData[]>({
    queryKey: ['/api/holidays/comprehensive', selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/holidays/comprehensive/${selectedYear}`);
      if (!response.ok) {
        throw new Error('Failed to fetch holidays');
      }
      return response.json();
    },
    select: (data: any[]) => {
      // Transform the comprehensive API data into the format we need
      const holidaysByDate = new Map<string, HolidayData>();
      
      data.forEach(dayData => {
        const dateKey = dayData.date;
        
        // Process each state for this date
        if (dayData.states && typeof dayData.states === 'object') {
          Object.entries(dayData.states).forEach(([stateCode, stateInfo]: [string, any]) => {
            if (!holidaysByDate.has(dateKey)) {
              holidaysByDate.set(dateKey, {
                date: dateKey,
                name: dayData.name || stateInfo.name || 'Unbekannter Feiertag',
                type: stateInfo.isHoliday ? 'public_holiday' : 'school_holiday',
                states: {}
              });
            }
            
            const holiday = holidaysByDate.get(dateKey)!;
            
            // Set state information
            holiday.states[stateCode] = {
              isHoliday: stateInfo.isHoliday || false,
              isSchoolHoliday: stateInfo.isSchoolHoliday || false,
              holidayName: stateInfo.isHoliday ? stateInfo.name : undefined,
              schoolHolidayName: stateInfo.isSchoolHoliday ? stateInfo.name : undefined
            };
          });
        }
      });
      
      return Array.from(holidaysByDate.values());
    }
  });

  // Filter and sort data
  const filteredData = useMemo(() => {
    if (!holidaysData) return [];
    
    let filtered = holidaysData.filter(holiday => {
      // Filter by search term
      if (searchTerm && !holiday.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Filter by type
      if (filterType !== 'all') {
        const hasType = Object.values(holiday.states).some(state => {
          if (filterType === 'public_holiday') return state.isHoliday;
          if (filterType === 'school_holiday') return state.isSchoolHoliday;
          return false;
        });
        if (!hasType) return false;
      }
      
      return true;
    });
    
    // Sort data
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        return a.name.localeCompare(b.name, 'de');
      }
    });
    
    return filtered;
  }, [holidaysData, searchTerm, filterType, sortBy]);

  const getStateStatus = (holiday: HolidayData, stateCode: string) => {
    const stateData = holiday.states[stateCode];
    if (!stateData) return null;
    
    if (stateData.isHoliday && stateData.isSchoolHoliday) {
      return { type: 'both', text: 'Feiertag + Ferien' };
    } else if (stateData.isHoliday) {
      return { type: 'holiday', text: 'Feiertag' };
    } else if (stateData.isSchoolHoliday) {
      return { type: 'school', text: 'Schulferien' };
    }
    
    return null;
  };

  const getStatusBadge = (status: { type: string; text: string } | null) => {
    if (!status) return <span className="text-gray-300 text-xs">-</span>;
    
    switch (status.type) {
      case 'both':
        return <Badge variant="default" className="bg-purple-500 text-xs">Beide</Badge>;
      case 'holiday':
        return <Badge variant="default" className="bg-red-500 text-xs">Feiertag</Badge>;
      case 'school':
        return <Badge variant="secondary" className="bg-blue-500 text-white text-xs">Ferien</Badge>;
      default:
        return <span className="text-gray-300 text-xs">-</span>;
    }
  };

  const exportData = () => {
    const csvContent = [
      ['Datum', 'Name', ...GERMAN_STATES.map(s => s.short)].join(','),
      ...filteredData.map(holiday => [
        format(new Date(holiday.date), 'dd.MM.yyyy'),
        `"${holiday.name}"`,
        ...GERMAN_STATES.map(state => {
          const status = getStateStatus(holiday, state.code);
          return status ? status.text : '';
        })
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `feiertage_ferien_${selectedYear}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Feiertage und Schulferien</h1>
          <p className="text-gray-600 mt-2">
            Übersicht aller Feiertage und Schulferien nach Bundesländern
          </p>
        </div>
        
        <Button onClick={exportData} disabled={!filteredData.length}>
          <Download className="h-4 w-4 mr-2" />
          CSV Export
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter und Suche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Jahr</Label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Typ</Label>
              <Select value={filterType} onValueChange={(value: 'all' | 'public_holiday' | 'school_holiday') => setFilterType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="public_holiday">Nur Feiertage</SelectItem>
                  <SelectItem value="school_holiday">Nur Schulferien</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Sortierung</Label>
              <Select value={sortBy} onValueChange={(value: 'date' | 'name') => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Nach Datum</SelectItem>
                  <SelectItem value="name">Nach Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Suche</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Name suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <CalendarIcon className="h-8 w-8 text-red-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Gesetzliche Feiertage</p>
                <p className="text-2xl font-bold text-gray-900">
                  {filteredData.filter(h => Object.values(h.states).some(s => s.isHoliday)).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Schulferienperioden</p>
                <p className="text-2xl font-bold text-gray-900">
                  {filteredData.filter(h => Object.values(h.states).some(s => s.isSchoolHoliday)).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Filter className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Gefilterte Einträge</p>
                <p className="text-2xl font-bold text-gray-900">
                  {filteredData.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle>Feiertage und Schulferien {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                      Datum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-20 bg-gray-50 z-10 min-w-[200px]">
                      Name
                    </th>
                    {GERMAN_STATES.map(state => (
                      <th key={state.code} className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                        <div className="flex flex-col items-center">
                          <span className="font-bold">{state.short}</span>
                          <span className="text-[10px] text-gray-400 leading-tight mt-1">
                            {state.name.split(' ').map(word => word.substring(0, 4)).join(' ')}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredData.map((holiday, index) => (
                    <tr key={`${holiday.date}-${index}`} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                        {format(new Date(holiday.date), 'dd.MM.yyyy')}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 sticky left-20 bg-white z-10 min-w-[200px]">
                        <div className="max-w-[200px]">
                          <p className="font-medium truncate" title={holiday.name}>
                            {holiday.name}
                          </p>
                        </div>
                      </td>
                      {GERMAN_STATES.map(state => {
                        const status = getStateStatus(holiday, state.code);
                        return (
                          <td key={state.code} className="px-2 py-4 whitespace-nowrap text-center">
                            {getStatusBadge(status)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Daten gefunden</h3>
              <p className="mt-1 text-sm text-gray-500">
                Für das Jahr {selectedYear} wurden keine Feiertage oder Schulferien mit den aktuellen Filtern gefunden.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Legende</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Badge variant="default" className="bg-red-500">Feiertag</Badge>
              <span className="text-sm text-gray-600">Gesetzlicher Feiertag</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="bg-blue-500 text-white">Ferien</Badge>
              <span className="text-sm text-gray-600">Schulferien</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="default" className="bg-purple-500">Beide</Badge>
              <span className="text-sm text-gray-600">Feiertag und Schulferien</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-300 text-xs">-</span>
              <span className="text-sm text-gray-600">Kein Feiertag/Ferien</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}