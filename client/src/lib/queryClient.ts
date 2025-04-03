import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  data?: any,
  method: string = "GET",
  options?: {
    headers?: Record<string, string>;
  }
): Promise<any> {
  // Stelle sicher, dass URL mit /api beginnt
  const apiUrl = url.startsWith('/api') ? url : `/api${url}`;
  
  // Füge das Auth-Token aus dem localStorage hinzu, wenn vorhanden
  const token = localStorage.getItem('auth_token');
  
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options?.headers || {})
  };
  
  console.log(`API Request: ${method} ${apiUrl}`, data);
  
  const res = await fetch(apiUrl, {
    method: method.toUpperCase(),
    headers: headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // Bei leerer Antwort (204 No Content) ein leeres Objekt zurückgeben
  if (res.status === 204) {
    return {};
  }
  
  // Ansonsten JSON parsen
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Stelle sicher, dass URL mit /api beginnt
    const url = queryKey[0] as string;
    const apiUrl = url.startsWith('/api') ? url : `/api${url}`;
    
    // Füge das Auth-Token aus dem localStorage hinzu, wenn vorhanden
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(apiUrl, {
      headers: headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
      // Bei Fehler sollen wir die Funktion aufrufen
      onError: handleError
    },
    mutations: {
      retry: false,
      onError: handleError
    },
  }
});
