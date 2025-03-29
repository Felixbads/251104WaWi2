import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface NotFoundProps {
  title?: string;
  message?: string;
}

export default function NotFound({ 
  title = "404 Page Not Found", 
  message = "Die angeforderte Seite konnte nicht gefunden werden."
}: NotFoundProps) {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-red-500 flex-shrink-0" />
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">{title}</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            {message}
          </p>
          
          <div className="mt-6 flex justify-end">
            <Link href="/">
              <Button>
                Zurück zum Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
