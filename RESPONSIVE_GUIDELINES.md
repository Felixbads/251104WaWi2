# Responsive Design Guidelines

Dieses Dokument beschreibt die responsive Design-Richtlinien für die Inventur-App.

## Breakpoints

Die Applikation verwendet folgende Breakpoints:

| Name | Größe | Verwendung |
|------|-------|------------|
| Small (sm) | ≥ 576px | Einfache Listen, Accordions anstelle von Tabellen |
| Medium (md) | ≥ 768px | Zweispaltiges Layout, horizontale Tabellen-Scrolls |
| Large (lg) | ≥ 992px | Volle Tabellenansicht, komplettes Layout |
| XL (xl) | ≥ 1200px | Erweiterte Funktionen, großes Desktop-Layout |

## CSS-Utility-Klassen

Wir verwenden folgende Utility-Klassen für responsive Layouts:

### Display-Klassen
- `.d-none`, `.d-block`, `.d-flex`, `.d-grid` - Basis-Display-Eigenschaften
- `.d-sm-*`, `.d-md-*`, `.d-lg-*`, `.d-xl-*` - Breakpoint-spezifische Display-Eigenschaften

### Flex-Klassen
- `.flex-column`, `.flex-row` - Flex-Richtung
- `.flex-sm-*`, `.flex-md-*`, `.flex-lg-*` - Breakpoint-spezifische Flex-Richtung

### Tabellen
- `.table-container` - Container für Tabellen mit horizontalem Scrollen
- `.table-responsive-cards` - Container für Tabellen die auf mobilen Geräten als Karten angezeigt werden

### Mobile UI-Elemente
- `.mobile-drawer` - Bottom-Sheet-Dialog auf mobilen Geräten, reguläres Modal auf Desktop
- `.mobile-action-footer` - Sticky Footer für Aktionen auf mobilen Geräten
- `.floating-action-button` - Floating Action Button (FAB) für mobilen Zugriff auf Hauptaktionen

## Beispiele

### Responsives Tabellen-Layout

```jsx
// Für kleine Bildschirme (< 768px) wird die Tabelle als Liste angezeigt
// Für größere Bildschirme wird sie als reguläre Tabelle mit horizontalem Scroll angezeigt
<div className="table-responsive-cards">
  {/* Tabelle für größere Bildschirme */}
  <div className="table-container">
    <Table className="responsive-table">
      ...
    </Table>
  </div>
  
  {/* Accordion-Liste für mobile Geräte */}
  <div className="accordion-list">
    {items.map(item => (
      <Accordion key={item.id}>
        <AccordionTrigger>{item.title}</AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span className="font-medium">ID:</span>
              <span>{item.id}</span>
            </div>
            ...
          </div>
        </AccordionContent>
      </Accordion>
    ))}
  </div>
</div>
```

### Mobile-First Dialog

```jsx
// Auf mobilen Geräten wird der Dialog von unten eingeblendet
// Auf größeren Bildschirmen wird er zentriert dargestellt
<Dialog>
  <DialogTrigger>
    <Button>Dialog öffnen</Button>
  </DialogTrigger>
  <DialogContent className="mobile-drawer md:mobile-drawer">
    <DialogHeader>
      <DialogTitle>Dialog Titel</DialogTitle>
      <DialogDescription>Dialog Beschreibung</DialogDescription>
    </DialogHeader>
    <div>Dialog Inhalt...</div>
    <DialogFooter>
      <Button>Aktion</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Aktions-Buttons auf mobilen Geräten

```jsx
// Auf mobilen Geräten werden die Aktionen am unteren Bildschirmrand fixiert angezeigt
// Auf größeren Geräten werden sie regulär im Layout dargestellt
<div className="mobile-action-footer">
  <div className="container mx-auto flex justify-end gap-2">
    <Button variant="outline">Abbrechen</Button>
    <Button>Speichern</Button>
  </div>
</div>

// Floating Action Button für Hauptaktion auf mobilen Geräten
<Button className="floating-action-button d-md-none">
  <Plus className="h-6 w-6" />
</Button>
```

## Testing

Verwenden Sie diese Befehle für das Testen der responsiven Layouts:

```bash
# Cypress-Test für responsive Breakpoints
npm run test:responsive

# Visual Regression Tests mit Percy
npm run percy:snapshot
```

## Best Practices

1. **Mobile-First entwickeln**: Designen Sie immer zuerst für mobile Geräte (320px Breite) und erweitern Sie dann für größere Bildschirme.

2. **Touch-Ziele optimieren**: Alle interaktiven Elemente sollten mindestens 48×48px groß sein.

3. **Scroll-Reset vermeiden**: Verwenden Sie das `useScrollToField`-Hook anstelle von `window.scrollTo(0,0)` beim Rendern.

4. **Tabellen transformieren**: Wandeln Sie Tabellen auf kleinen Bildschirmen in Listen oder Accordions um.

5. **Einheitliche Breakpoints**: Verwenden Sie immer die definierten Breakpoints aus `responsive-guidelines.css`.