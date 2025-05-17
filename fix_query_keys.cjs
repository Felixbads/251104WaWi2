// Script zur Aktualisierung der Query-Keys in BestellungV2.tsx
const fs = require('fs');
const path = require('path');

// Lese die Datei
const filePath = path.join(process.cwd(), 'client/src/pages/BestellungV2.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Ersetze die erste Stelle (Zeile ~460)
content = content.replace(
  /              \/\/ Invalidiere den Cache für Bestellungen\n              queryClient\.invalidateQueries\(\{queryKey: \['\/api\/orders'\]\}\);\n              queryClient\.invalidateQueries\(\{queryKey: \[\`\/api\/orders\/\${orderId}\`\]\}\);/,
  `              // Invalidiere den Cache für Bestellungen mit zentralisierten Keys\n              queryClient.invalidateQueries({queryKey: orderKeys.lists()});\n              queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId || 0)});`
);

// Ersetze die zweite Stelle (Zeile ~524)
content = content.replace(
  /              \/\/ Invalidiere den Cache für Bestellungen\n              queryClient\.invalidateQueries\(\{queryKey: \['\/api\/orders'\]\}\);\n              queryClient\.invalidateQueries\(\{queryKey: \[\`\/api\/orders\/\${orderId}\`\]\}\);/g,
  `              // Invalidiere den Cache für Bestellungen mit zentralisierten Keys\n              queryClient.invalidateQueries({queryKey: orderKeys.lists()});\n              queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId || 0)});`
);

// Schreibe die Datei zurück
fs.writeFileSync(filePath, content);
console.log('Datei BestellungV2.tsx erfolgreich aktualisiert');
