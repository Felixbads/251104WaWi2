import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary-Komponente zum Abfangen von React-Fehlern
 * und Anzeigen einer benutzerfreundlichen Fehlermeldung statt eines weißen Bildschirms
 */
class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Aktualisiere den state, damit beim nächsten Rendern die Fallback-UI angezeigt wird
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Fehler in einem React-Komponenten:", error, errorInfo);
  }

  private handleReload = () => {
    // Seite neu laden, um den Fehler zu beheben
    window.location.reload();
  };

  private handleGoHome = () => {
    // Zur Startseite navigieren
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      // Benutzerdefinierte Fallback-UI oder Standard-Fehlermeldung
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-muted/20 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl flex items-center text-red-600">
                <AlertCircle className="mr-2 h-6 w-6" />
                Es ist ein Fehler aufgetreten
              </CardTitle>
              <CardDescription>
                Die Anwendung konnte nicht richtig geladen werden.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-3 rounded-md text-sm overflow-auto max-h-[200px]">
                {this.state.error?.message || "Unbekannter Fehler"}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={this.handleGoHome}>
                Zur Startseite
              </Button>
              <Button onClick={this.handleReload} className="flex items-center">
                <RefreshCw className="mr-2 h-4 w-4" />
                Neu laden
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;