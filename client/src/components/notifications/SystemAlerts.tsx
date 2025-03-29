import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEvents, formatDateTime } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertCircle, CheckCircle, AlertTriangle, Info } from "lucide-react";

export default function SystemAlerts() {
  const [limit] = useState(4);
  
  const { data: events, isLoading, error } = useQuery({
    queryKey: [`/api/events?limit=${limit}`],
    queryFn: () => getEvents(limit),
  });

  // Helper to get icon and color based on severity
  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          bgColor: "bg-red-100",
          textColor: "text-red-800",
          icon: <AlertCircle className="h-5 w-5" />,
        };
      case "warning":
        return {
          bgColor: "bg-yellow-100",
          textColor: "text-yellow-800",
          icon: <AlertTriangle className="h-5 w-5" />,
        };
      case "success":
        return {
          bgColor: "bg-green-100",
          textColor: "text-green-800",
          icon: <CheckCircle className="h-5 w-5" />,
        };
      case "info":
      default:
        return {
          bgColor: "bg-blue-100",
          textColor: "text-blue-800",
          icon: <Info className="h-5 w-5" />,
        };
    }
  };

  // Mock data for demonstration purposes when no events are available
  const mockAlerts = [
    {
      id: 1,
      severity: "critical",
      title: "Verbindungsfehler",
      description: "Getränkeautomat Kantine ist seit 3 Stunden offline.",
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    },
    {
      id: 2,
      severity: "warning",
      title: "Produktbestand niedrig",
      description: "Kaffeeautomat EG: Milchvorrat unter 15%.",
      timestamp: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
    },
    {
      id: 3,
      severity: "success",
      title: "Synchronisierung abgeschlossen",
      description: "Tägliche Synchronisierung erfolgreich.",
      timestamp: new Date(Date.now() - 14400000).toISOString(), // 4 hours ago
    },
    {
      id: 4,
      severity: "info",
      title: "API Update",
      description: "Neue API-Version verfügbar: v2.5.1",
      timestamp: new Date(Date.now() - 86400000).toISOString(), // 24 hours ago
    },
  ];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-800">
            System-Benachrichtigungen
          </h2>
        </div>
        <div className="p-4">
          <ul className="divide-y divide-gray-200">
            {Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="py-3">
                <div className="flex items-start">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="ml-3 flex-1">
                    <Skeleton className="h-5 w-full max-w-[200px] mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-red-600 mb-2">
          Fehler beim Laden der Systembenachrichtigungen
        </h2>
        <p className="text-gray-600 mb-4">
          {error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten"}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  // Use events from API or fallback to mockAlerts if no events available
  const displayEvents = events && events.length > 0 ? events : mockAlerts;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-800">
          System-Benachrichtigungen
        </h2>
      </div>
      <div className="p-4">
        <ul className="divide-y divide-gray-200">
          {displayEvents.map((event) => {
            const { bgColor, textColor, icon } = getAlertIcon(
              event.severity || "info"
            );
            return (
              <li key={event.id} className="py-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-0.5">
                    <span
                      className={`${bgColor} ${textColor} flex h-8 w-8 rounded-full items-center justify-center`}
                    >
                      {icon}
                    </span>
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {event.title || event.eventName}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {event.description}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      {formatDateTime(event.timestamp || event.datetime)}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
        <Link href="/events">
          <a className="text-sm font-medium text-primary-600 hover:text-primary-800">
            Alle Benachrichtigungen ansehen
          </a>
        </Link>
      </div>
    </div>
  );
}
