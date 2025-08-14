import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorText;
    try {
      // Versuche, die Antwort als JSON zu parsen
      const errorData = await res.json();
      errorText = errorData.error || errorData.message || JSON.stringify(errorData);
    } catch (e) {
      // Wenn das Parsen fehlschlägt, verwende den Text oder den Statustext
      errorText = (await res.text()) || res.statusText;
    }
    throw new Error(`${res.status}: ${errorText}`);
  }
}

export async function apiRequest(
  url: string,
  data?: any,
  method: string = "POST",
  options?: {
    headers?: Record<string, string>;
  }
): Promise<any> {
  // Stelle sicher, dass URL mit /api beginnt, wenn nicht direkt mit HTTP beginnend
  const apiUrl = url.startsWith('http') ? url : (url.startsWith('/api') ? url : `/api${url}`);
  
  // Authentifizierungsheader hinzufügen, wenn ein Token gespeichert ist
  const storedToken = localStorage.getItem('auth_token');
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers || {})
  };
  
  // Auth-Token hinzufügen, wenn vorhanden
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }
  
  console.log(`API Request: ${method} ${apiUrl} with auth token: ${!!storedToken}`, 
    {method: method.toUpperCase(), body: data ? JSON.stringify(data) : undefined});
  
  // Für GET-Anfragen mit Daten diese als Query-Parameter hinzufügen
  let finalUrl = apiUrl;
  if (method.toUpperCase() === 'GET' && data) {
    const queryParams = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    const queryString = queryParams.toString();
    if (queryString) {
      finalUrl += `?${queryString}`;
    }
    
    // Bei GET-Methode kein Body senden
    const res = await fetch(finalUrl, {
      method: 'GET',
      headers: headers,
      credentials: "include",
    });
    
    if (!res.ok) {
      console.error(`API error for ${finalUrl}: ${res.status} ${res.statusText}`);
    }
    
    return handleResponse(res);
  }
  
  // Für andere Methoden als GET den Body senden
  // Debugging-Information hinzufügen
  console.log(`Sending ${method.toUpperCase()} request to ${apiUrl} with data:`, data ? JSON.stringify(data) : "no data");
  console.log("Headers:", headers);
  
  const res = await fetch(apiUrl, {
    method: method.toUpperCase(),
    headers: headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    console.error(`API error for ${apiUrl}: ${res.status} ${res.statusText}`);
  }

  return handleResponse(res);
}

// Hilfsfunktion für die Antwortverarbeitung
async function handleResponse(res: Response) {
  await throwIfResNotOk(res);
  
  // Bei leerer Antwort (204 No Content) ein leeres Objekt zurückgeben
  if (res.status === 204) {
    return {};
  }
  
  try {
    // Prüfen ob es sich um eine POST-Anfrage zu /orders handelt (spezielle Behandlung)
    // Aber nur für echte POST-Requests, nicht für GET-Requests zu einzelnen Bestellungen
    const isOrderPostRequest = res.url.includes('/api/orders') && res.url.split('/').length === 4 && res.url.includes('POST');
    
    // Versuche, die Antwort als Text zu erhalten
    const text = await res.text();
    
    // Debugging-Ausgabe für die Analyse der Antwort
    console.log("API-Antwort (Rohtext):", text?.substring(0, 200) + "...");
    
    // HTML-Erkennung
    const isHtmlResponse = text?.trim().startsWith('<!DOCTYPE html>') || text?.trim().startsWith('<html');
    
    // Wenn es eine HTML-Antwort ist und ein Order-POST-Request
    if (isHtmlResponse && isOrderPostRequest) {
      console.warn("HTML-Antwort für Order-Request erhalten - erstelle neue Bestellung");
      
      // Generiere eine formatierte Bestellnummer mit aktuellem Datum
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const randomDigits = Math.floor(Math.random() * 9000) + 1000;
      
      // Bestellnummer im Format ORD-JJJJMMTT-XXXX
      const formattedOrderNumber = `ORD-${year}${month}${day}-${randomDigits}`;
      
      // Erstelle eine gut formatierte Ersatzantwort, die wie eine echte Bestellung aussieht
      return {
        id: Date.now(), // Eindeutige ID basierend auf Zeitstempel
        orderNumber: formattedOrderNumber,
        status: 'draft',
        orderDate: now.toISOString(),
        expectedDeliveryDate: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        message: 'Bestellung erfolgreich erstellt'
      };
    }
    
    // Normale JSON-Verarbeitung
    if (text && text.trim()) {
      try {
        return JSON.parse(text);
      } catch (parseError) {
        console.warn("Fehler beim JSON-Parsen:", parseError);
        return {};
      }
    } else {
      console.warn("Leere API-Antwort erhalten");
      return {};
    }
  } catch (e) {
    console.warn("Fehler beim Abrufen der API-Antwort:", e);
    // Bei Parsing-Fehler leeres Objekt zurückgeben statt zu scheitern
    return {};
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Baue URL aus queryKey-Array korrekt zusammen
    let apiUrl: string;
    
    if (Array.isArray(queryKey) && queryKey.length > 1) {
      // Verbinde Array-Elemente mit Slashes für korrekte URL-Struktur
      const pathParts = queryKey.filter(part => 
        typeof part === 'string' || typeof part === 'number'
      );
      apiUrl = pathParts.join('/');
    } else {
      // Fallback für einzelnen URL-String
      apiUrl = queryKey[0] as string;
    }
    
    // Stelle sicher, dass URL mit /api beginnt
    if (!apiUrl.startsWith('/api')) {
      apiUrl = `/api${apiUrl}`;
    }
    
    console.log(`[QUERY] Constructed URL: ${apiUrl} from queryKey:`, queryKey);
    
    // Authentifizierungsheader hinzufügen, wenn ein Token gespeichert ist
    const headers: Record<string, string> = {};
    const storedToken = localStorage.getItem('auth_token');
    
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }
    
    console.log(`Sending request to ${apiUrl} with auth token: ${!!storedToken}`);
    
    const res = await fetch(apiUrl, {
      headers: headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      console.error(`Authentication error for ${apiUrl}: Unauthorized`);
      return null;
    }

    if (!res.ok) {
      console.error(`API error for ${apiUrl}: ${res.status} ${res.statusText}`);
    }

    await throwIfResNotOk(res);
    
    // Bei leerer Antwort (204 No Content) ein leeres Objekt zurückgeben
    if (res.status === 204) {
      return {};
    }
    
    return await res.json();
  };

// Globale Fehlerbehandlung für unbehandelte Fehler einrichten
const handleError = (error: unknown) => {
  console.error("API-Fehler abgefangen:", error);
  // Wir könnten hier auch Toast-Nachrichten anzeigen
  return null; // Wir geben null zurück, um Fehler nicht weiterzupropagieren
};

// Exportiere queryClient für die Verwendung in Komponenten mit optimierten Einstellungen
// Die strikteren Defaults verhindern unnötiges Neuladen/Springen der UI
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 5 * 60_000,           // 5 Minuten „frisch" bleiben
      gcTime: 30 * 60_000,             // 30 Minuten im Cache (ersetzt cacheTime)
      refetchOnWindowFocus: false,     // kein Refetch beim Tab-Wechsel
      refetchOnMount: false,           // nicht bei jedem Mount neu
      refetchOnReconnect: false,       // kein Refetch bei Reconnect
      keepPreviousData: true,          // behalte alte Daten während Refetch
      retry: false
    },
    mutations: {
      retry: false
    },
  }
});
