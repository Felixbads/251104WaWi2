import { useEffect } from 'react';
import { useLocation } from 'wouter';

// Redirect-Component für /lager zur neuen Warenbewegungsseite
export default function LagerPage() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    // Leite sofort zur neuen Warenbewegungsseite um
    setLocation('/warenbewegung/new');
  }, [setLocation]);
  
  return null; // Keine Renderung nötig, da sofortige Umleitung
}