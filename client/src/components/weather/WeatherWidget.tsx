import React from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CurrentWeatherCard from './CurrentWeather';
import WeatherForecast from './WeatherForecast';
import { CalendarDays, Cloud } from 'lucide-react';

interface WeatherWidgetProps {
  className?: string;
  forecastDays?: number;
}

/**
 * Ein komplettes Widget für das Dashboard, das aktuelles Wetter und Wettervorhersage 
 * mit Feiertags- und Schulferieninformationen kombiniert.
 */
const WeatherWidget: React.FC<WeatherWidgetProps> = ({ className = "", forecastDays = 7 }) => {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <Tabs defaultValue="forecast">
        <div className="px-4 pt-4 pb-2 border-b">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="forecast" className="flex gap-1.5 items-center">
              <CalendarDays className="h-4 w-4" />
              <span>Wettervorhersage</span>
            </TabsTrigger>
            <TabsTrigger value="current" className="flex gap-1.5 items-center">
              <Cloud className="h-4 w-4" />
              <span>Aktuelles Wetter</span>
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="forecast" className="m-0">
          <WeatherForecast 
            days={forecastDays} 
            showTitle={false}
            className="border-0 shadow-none rounded-none"
          />
        </TabsContent>
        
        <TabsContent value="current" className="m-0">
          <CurrentWeatherCard 
            showTitle={false}
            className="border-0 shadow-none rounded-none"
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default WeatherWidget;