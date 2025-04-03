import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Globale Fehlerbehandlung für unbehandelte Promises
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unbehandelte Promise-Ablehnung:', event.reason);
  // Optional: Fehler an einen Dienst senden oder global behandeln
  event.preventDefault(); // Verhindert Standardfehlerbehandlung im Browser
});

createRoot(document.getElementById("root")!).render(<App />);
