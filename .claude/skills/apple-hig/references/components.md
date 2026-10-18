# Komponenten – HIG-Regeln mit Web-Gerüst

Jede Komponente: **Wann** · **Regeln** · **Gerüst**. Tokens aus `assets/hig-tokens.css`.

## 1. App-Rahmen: Split View / Sidebar / Tab-Bar
**Wann:** immer. Regular-Breite (≥ 768 px) → Sidebar + Inhalt. Compact → Tab-Bar unten.
HIG: „Consider using a tab bar first“; bei mehr Platz Tab-Bar → Sidebar, **Funktionen bleiben gleich**.
- Tab-Bar 3–5 Einträge, Symbol + Label, schwebt (Liquid Glass) über dem Inhalt, immer sichtbar, keine Aktionen.
- Sidebar: Gruppen mit kurzen Überschriften, max. 2 Ebenen, Auswahl hervorgehoben (`aria-current="page"`).
- Einstellungen nie als 6. Tab – als Toolbar-Button bzw. letzter Sidebar-Eintrag.
```html
<nav class="sidebar glass" aria-label="Bereiche"><a aria-current="page" href="#/heute">Heute</a></nav>
<main class="content">…</main>
<nav class="tabbar glass" aria-label="Bereiche"><a href="#/heute" aria-current="page"><svg aria-hidden="true"/><span>Heute</span></a></nav>
```

## 2. Navigationsleiste mit Large Title
Titel = Bereich/Objekt, nie App-Name. Leading: Zurück (Chevron + Titel der Vorseite). Trailing: 1–3 rahmenlose
Symbol-Buttons, Hauptaktion zuletzt. Large Title unter der Leiste; beim Scrollen kleiner Titel mittig (Scroll-Edge-Effekt).
```html
<header class="navbar"><a class="nav-back" href="#/projekte">Projekte</a><span class="nav-title">Büro Müller</span>
<div class="nav-actions"><button class="icon-btn" aria-label="Neue Aufgabe">+</button></div></header>
<h1 class="large-title">Büro Müller</h1>
```

## 3. Listen (Inset Grouped)
- Zeile ≥ 44 pt; Text knapp; Sekundärinfo `--label-secondary` oder trailing; Drill-down mit Chevron (`--label-tertiary`).
- Abschnitts-Header in Footnote, normale Schreibweise; Footer für Erklärungen.
- Auswahl-Feedback (`:active` → `--fill-tertiary`); Trenner ab Textbeginn eingerückt.
- Wischaktionen nur zusätzlich – jede Aktion auch sichtbar erreichbar.
```html
<section class="group"><h3 class="group-header">Heute</h3>
<ul class="list"><li><a class="cell" href="#/…"><span class="cell-icon"></span>
<span class="cell-text"><span class="cell-title">Aufmaß Firma Müller</span><span class="cell-sub">Naturmaß · 10:00</span></span>
<span class="cell-detail">Heute</span><span class="chevron"></span></a></li></ul>
<p class="group-footer">Erklärender Text.</p></section>
```

## 4. Buttons
| Stil | Verwendung |
|---|---|
| Filled/Prominent (Akzent-Fläche, weiß) | die *eine* wahrscheinlichste Aktion der Ansicht |
| Tinted (Akzent 15 %, Akzent-Text) | sekundäre Aktionen in Karten |
| Gray (`--fill-secondary`) | neutrale Aktionen |
| Plain (nur Akzent-Text) | Toolbar, Listen, inline |
| Destruktiv (`--critical`) | Löschen – nie Primärrolle |

Höhe ≥ 44 pt, Verb als Label, Gedrückt-Zustand, deaktiviert in `--label-tertiary`, Spinner im Button bei längerer Aktion.

## 5. Segmented Control
Max. 5 Segmente, gleich breit, Nomen, Text *oder* Symbole. Für eng verwandte Ansichten desselben Objekts.
`role="tablist"` + `aria-selected`. Auswahl = elevated Kapsel auf `--fill-tertiary`.

## 6. Sheets
Kurze, abgeschlossene Aufgabe. Kopf: „Abbrechen“ leading, Titel mittig (Headline), Bestätigen trailing (fett, konkret:
„Hinzufügen“, „Sichern“). Ungesicherte Änderungen → beim Abbrechen nachfragen („Änderungen verwerfen“). Esc schließt.
Compact: von unten, Grabber, obere Ecken rund. Regular: zentrierte Karte ~540 px. Nur ein Sheet gleichzeitig.
Lange Abläufe → eigene Seite.
```html
<dialog class="sheet" aria-labelledby="t"><div class="grabber"></div>
<header class="sheet-bar"><button class="btn-plain">Abbrechen</button><h2 id="t">Neues Projekt</h2>
<button class="btn-plain bold">Hinzufügen</button></header><form class="sheet-body">…</form></dialog>
```

## 7. Formulare
Felder in gruppierten Zellen; Label leading, Eingabe trailing (oder darüber bei langen Texten). Passende Typen
(`email`, `tel`, `date`, `datetime-local`, `inputmode="decimal"`), `autocomplete`. Auswahl statt Freitext.
Switch nur in Listenzeilen. Bestätigen deaktiviert, bis gültig; Fehler unter dem Feld (Footnote, `--critical` + Symbol).

## 8. Alerts, Action Sheets, Undo
- Alert: kritisch/destruktiv, max. 3 Buttons, Titel = Situation („Projekt löschen?“), Buttons konkret („Löschen“ rot + „Abbrechen“). Nie „OK/Ja/Nein“.
- Action Sheet: Auswahl zu bewusster Aktion (Exportieren, Verwerfen). Compact unten, Regular als Popover.
- Häufig + umkehrbar (abhaken, löschen) → sofort ausführen + Toast „Rückgängig“.

## 9. Fortschritt & Status
Balken (4–6 pt, Kapsel) mit Prozent als Text; Ring mit Zahl; Spinner nur bei unbekannter Dauer.
Status immer Farbe + Text/Symbol: „Im Budget“, „Knapp“, „Überschritten“.

## 10. Diagramme
Balken für Kategorien (Plan vs. Beauftragt vs. Abgerechnet), Achse ab 0, Zusammenfassungssatz darüber,
Werte auch als Text. Konsistente Farben in allen Diagrammen.

## 11. Suche
Suchfeld oben in Listen bzw. Toolbar/Sidebar; Platzhalter sagt, was gesucht wird; live filtern; Löschen-Button.

## 12. Toast (nicht-modal)
Bestätigung + Undo. Unten über der Tab-Bar, Glas, 4–6 s, `role="status"`. Nie für handlungsrelevante Fehler.

## 13. Chat (Nachrichten-Muster)
Eigene Nachrichten rechts in Akzentblase (weiß), Gegenseite links (`--bg-grouped-secondary`). Eingabeleiste unten (Glas),
runder Senden-Button, deaktiviert ohne Text. Vorschläge als Kapseln. KI-Antworten als solche kennzeichnen.
