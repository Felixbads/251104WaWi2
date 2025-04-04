// Skript zum Generieren einer Testdatei für den Vendon Excel-Import mit neuen Transaktionen und gültigen Maschinen-IDs
const xlsx = require('xlsx');
const fs = require('fs');

// Testtransaktionen erstellen (mit neuen IDs)
const transactions = [
  {
    "Transaction ID": "9900000004",
    "Datetime": new Date("2025-04-04T12:01:02.000Z"),
    "Machine ID": 52, // Bad Schandau, Nationalparkbahnhof (vendon_id: 323959)
    "Machine Name": "Bad Schandau, Nationalparkbahnhof",
    "Product Name": "Knusperflocken (Zetti, Zeitz)",
    "Price": 2.5,
    "Payment Method": "CASH",
    "Status": "completed"
  },
  {
    "Transaction ID": "9900000005",
    "Datetime": new Date("2025-04-04T12:57:38.000Z"),
    "Machine ID": 51, // Pfaffendorf (vendon_id: 323780)
    "Machine Name": "Pfaffendorf",
    "Product Name": "Wehlner Milch 0,5l (Milchhof Fiedler, Wehlen)",
    "Price": 1.8,
    "Payment Method": "CASHLESS",
    "Status": "completed"
  },
  {
    "Transaction ID": "9900000006",
    "Datetime": new Date("2025-04-04T13:56:57.000Z"),
    "Machine ID": 53, // Rathen (vendon_id: 325762)
    "Machine Name": "Rathen",
    "Product Name": "Wehlner Milch 0,5l (Milchhof Fiedler, Wehlen)",
    "Price": 1.8,
    "Payment Method": "CASHLESS",
    "Status": "completed"
  }
];

// Erstellen eines Workbooks
const workbook = xlsx.utils.book_new();

// Daten in ein Worksheet umwandeln
const worksheet = xlsx.utils.json_to_sheet(transactions);

// Worksheet zum Workbook hinzufügen
xlsx.utils.book_append_sheet(workbook, worksheet, "Transactions");

// Excel-Datei speichern
xlsx.writeFile(workbook, "test_transactions_correct.xlsx");

console.log("Testdatei 'test_transactions_correct.xlsx' wurde erstellt.");