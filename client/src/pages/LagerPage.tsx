import { useEffect } from 'react';
import { useLocation } from 'wouter';

// Redirect-Component für /lager zu /inventory
export default function LagerPage() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    // Leite sofort zum /inventory-Pfad um
    setLocation('/inventory');
  }, [setLocation]);
  
  return null; // Keine Renderung nötig, da sofortige Umleitung
}