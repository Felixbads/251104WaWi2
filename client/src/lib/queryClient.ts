import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  options?: {
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<any> {
  // Stelle sicher, dass URL mit /api beginnt
  const apiUrl = url.startsWith('/api') ? url : `/api${url}`;
  
  const headers = {
    "Content-Type": "application/json",
    ...(options?.headers || {})
  };
  
  console.log(`API Request: ${method} ${apiUrl}`, options?.body);
  
  const res = await fetch(apiUrl, {
    method: method.toUpperCase(),
    headers: headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
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
    
    const res = await fetch(apiUrl, {
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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
