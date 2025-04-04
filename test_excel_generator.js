// Skript zum Generieren einer Testdatei für den Vendon Excel-Import
const xlsx = require('xlsx');
const fs = require('fs');

// Testtransaktionen erstellen
const transactions = [
  {
    "Transaction ID": "2763838199",
    "Datetime": new Date("2025-04-04T06:01:02.000Z"),
    "Machine ID": 323959,
    "Machine Name": "Bad Schandau, Nationalparkbahnhof",
    "Product Name": "Knusperflocken (Zetti, Zeitz)",
    "Price": 2.5,
    "Payment Method": "CASH",
    "Status": "completed"
  },
  {
    "Transaction ID": "2763705400",
    "Datetime": new Date("2025-04-04T04:57:38.000Z"),
    "Machine ID": 323960,
    "Machine Name": "Dresden, Hauptbahnhof",
    "Product Name": "Wehlner Milch 0,5l (Milchhof Fiedler, Wehlen)",
    "Price": 1.8,
    "Payment Method": "CASHLESS",
    "Status": "completed"
  },
  {
    "Transaction ID": "2763704222",
    "Datetime": new Date("2025-04-04T04:56:57.000Z"),
    "Machine ID": 323961,
    "Machine Name": "Pirna, Bahnhof",
    "Product Name": "Wehlner Milch 0,5l (Milchhof Fiedler, Wehlen)",
    "Price": 1.8,
    "Payment Method": "CASHLESS",
    "Status": "completed"
  },
  {
    "Transaction ID": "2763702976",
    "Datetime": new Date("2025-04-04T04:56:14.000Z"),
    "Machine ID": 323962,
    "Machine Name": "Königstein, Festung",
    "Product Name": "Wehlner Milch 0,5l (Milchhof Fiedler, Wehlen)",
    "Price": 1.8,
    "Payment Method": "CASH",
    "Status": "completed"
  },
  {
    "Transaction ID": "2763701806",
    "Datetime": new Date("2025-04-04T04:55:33.000Z"),
    "Machine ID": 323963,
    "Machine Name": "Rathen, Fähre",
    "Product Name": "Wehlner Milch 0,5l (Milchhof Fiedler, Wehlen)",
    "Price": 1.8,
    "Payment Method": "CASH",
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
xlsx.writeFile(workbook, "test_transactions.xlsx");

console.log("Testdatei 'test_transactions.xlsx' wurde erstellt.");