import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Home } from "lucide-react";

interface NotFoundProps {
  title?: string;
  message?: string;
}

export default function NotFound({ 
  title = "Seite nicht gefunden", 
  message = "Die gesuchte Seite existiert nicht oder wurde verschoben." 
}: NotFoundProps) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] py-16 px-4 text-center">
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-full p-6 mb-6">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="60" 
          height="60" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="text-primary"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      <p className="text-gray-600 dark:text-gray-400 max-w-md mb-8">
        {message}
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Button 
          variant="outline" 
          onClick={() => window.history.back()}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <Button asChild>
          <Link href="/">
            <Home className="h-4 w-4 mr-2" />
            Zur Startseite
          </Link>
        </Button>
      </div>
    </div>
  );
}