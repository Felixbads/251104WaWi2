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
    // Versuche, die Antwort als JSON zu parsen
    return await res.json();
  } catch (e) {
    console.warn("Fehler beim Parsen der API-Antwort:", e);
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
    // Stelle sicher, dass URL mit /api beginnt
    const url = queryKey[0] as string;
    let apiUrl = url.startsWith('/api') ? url : `/api${url}`;
    
    // Check if there are query parameters in queryKey[1]
    if (queryKey.length > 1 && queryKey[1] && typeof queryKey[1] === 'object') {
      const queryParams = new URLSearchParams();
      
      // Add all parameters from queryKey[1] to the URLSearchParams
      Object.entries(queryKey[1] as Record<string, any>).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      // Append the query string to the URL if there are parameters
      const queryString = queryParams.toString();
      if (queryString) {
        apiUrl += `?${queryString}`;
        console.log(`API Request with params: ${apiUrl}`);
      }
    }
    
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
