---
name: apple-hig
description: Strikte Umsetzung der Apple Human Interface Guidelines (HIG, Stand Juni 2026 inkl. Liquid Glass) für Web-Apps, PWAs und native Oberflächen. Verwenden, sobald eine Oberfläche entworfen, gebaut oder geprüft wird – Navigation (Sidebar/Tab-Bar/Toolbar), Listen, Sheets, Alerts, Buttons, Formulare, Farben, Typografie, Dark Mode, Barrierefreiheit, Motion, Texte/UX-Writing. Enthält Design-Tokens (CSS), Komponenten-Regeln und eine Prüfliste.
---

# Apple Human Interface Guidelines – verbindlicher Skill

Quelle: developer.apple.com/design/human-interface-guidelines (Design principles, Foundations,
Patterns, Components; abgerufen Oktober 2026). Dieser Skill übersetzt die HIG in überprüfbare
Regeln. **Regeln mit MUSS sind nicht verhandelbar.** Wo die HIG native APIs nennt, steht hier das
Web-Äquivalent.

## Ablauf bei jeder UI-Arbeit

1. **Zweck klären** (Purpose): Was ist die *eine* wichtigste Aufgabe dieses Screens? Sie steht oben/leading.
2. **Struktur wählen** nach `references/components.md` → Navigation → Inhalt → Aktionen.
3. **Tokens verwenden**, nie Rohwerte: `assets/hig-tokens.css` (Farben, Typo, Abstände, Radien, Materialien).
4. **Texte schreiben** nach `references/writing.md` (Handlungsorientiert, kurz, konsistent).
5. **Zustände bauen**: leer, laden, Fehler, Erfolg, deaktiviert, gedrückt, Fokus.
6. **Prüfen** mit der Checkliste unten. Erst dann ist die UI fertig.

## Die acht Gestaltungsprinzipien (HIG „Design principles“)

| Prinzip | Bedeutet konkret |
|---|---|
| Purpose – Sinn stiften | Wichtigste Funktionen zuerst und richtig gut; alles andere tritt zurück. |
| Agency – Handlungsfreiheit | Nicht im Weg stehen, kein Zwang in Abläufe, Fehler leicht rückgängig machen (Undo statt Rückfrage). |
| Responsibility – Verantwortung | Transparent sagen, was die App tut (z. B. „KI hat Entwurf erstellt“), Daten schützen, nur Nötiges erfassen. |
| Familiarity – Vertrautheit | Bekannte Muster (Listen, Sheets, Tab-Bar), konsistent angewendet, klares Feedback. |
| Flexibility – Anpassungsfähigkeit | Größen­klassen, Dynamic Type, Tastatur, Touch, Screenreader, Dark Mode. |
| Simplicity – Einfachheit | Nur das Nötige; prägnante Wörter; klare Hierarchie. „Simplicity isn’t minimalism.“ |
| Craft – Sorgfalt | Präzise Abstände, ruhige Animationen, exakte Formulierungen. |
| Delight – Freude | Gefühl bewusst wählen (hier: Ruhe, Kontrolle); Freude nie als Dekoration. |

## Harte Regeln (MUSS)

**Layout & Navigation**
- MUSS nach verfügbarem Platz (Größenklasse) entscheiden, nicht nach Gerät: *compact* (< 768 px) → Tab-Bar unten; *regular* (≥ 768 px) → Sidebar (Split View). Gleiche Funktionen in beiden.
- Tab-Bar: nur Navigation, keine Aktionen; 3–5 Tabs; immer mit Label + Symbol; nie Tabs ausblenden/deaktivieren; Badge nur für kritische Info; keine Overflow-„Mehr“-Tabs.
- Sidebar: max. zwei Hierarchieebenen; aktuelle Auswahl dauerhaft hervorheben; vertraute Symbole; keine kritischen Aktionen ganz unten.
- Toolbar/Navigationsleiste: Titel des Bereichs (nie App-Name); Large Title zur Orientierung, beim Scrollen kompakt; Zurück-Button standard (Chevron + vorheriger Titel); wenige Aktionen, Hauptaktion rechts (trailing), prominent gestylt nur für „Fertig/Sichern“.
- Wichtigstes oben/leading; ausrichten; Einrückung = Unterordnung; Gruppen durch Abstand/Container; Progressive Disclosure (Disclosure, Drill-down) statt Überladung.
- Safe Areas respektieren (`env(safe-area-inset-*)`).

**Farbe**
- MUSS semantische System­farben verwenden (label, secondaryLabel, systemBackground, separator …) – nie Rohwerte im Komponenten-Code; nie Semantik umdeuten (separator ≠ Textfarbe).
- Eine Akzentfarbe für Interaktivität; dieselbe Farbe nie für nicht-interaktiven Text.
- Information nie *nur* über Farbe (immer zusätzlich Text/Symbol/Form).
- Kontrast: Text ≤ 17 pt mind. 4,5:1; ≥ 18 pt oder fett mind. 3:1; eigene Farben anstreben 7:1.
- Light **und** Dark Mode MÜSSEN funktionieren und dem System folgen. Keine app-eigene Hell/Dunkel-Einstellung als Pflicht (HIG rät ausdrücklich ab).
- Gruppierte Listen: `systemGroupedBackground` + `secondarySystemGroupedBackground` für Zellen.

**Typografie**
- Systemschrift (SF Pro über `-apple-system`/`system-ui`); max. eine Schriftfamilie.
- Textstile statt freier Größen (iOS „Large“-Standard): Large Title 34/41, Title 1 28/34, Title 2 22/28, Title 3 20/25, Headline 17/22 semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 1 12/16, Caption 2 11/13.
- Standard 17 pt, Minimum 11 pt (iOS) – auf macOS-Breiten Body 13–15 pt zulässig, nie < 10 pt.
- Keine Ultralight/Thin/Light-Schnitte; Regular, Medium, Semibold, Bold.
- Dynamic Type: Größen in `rem` an Browser-Schriftgröße koppeln; Layout muss bei 200 % Text funktionieren (stapeln statt abschneiden).

**Bedienelemente**
- Trefferfläche MUSS ≥ 44×44 pt (Minimum 28×28) sein; Abstand zwischen Controls gleich wichtig.
- Jeder eigene Button MUSS einen Gedrückt-Zustand haben; Stil (nicht Größe) unterscheidet die bevorzugte Aktion; nur eine prominente Aktion pro Ansicht.
- Rollen: normal, primär, abbrechen, destruktiv (rot). Destruktiv nie als Primärrolle.
- Schalter (Switch) nur in Listenzeilen; außerhalb Toggle-Button.
- Segmented Control: eng verwandte Optionen, ≤ 5 Segmente (iPhone), Nomen als Label, entweder Text oder Symbole.
- Textfelder: Platzhalter als Hinweis (nicht als Label-Ersatz für Pflichtinfo), passende Tastatur (`inputmode`, `type`), Validierung live, Löschen-Button bei Suche.
- Fortschritt: determinierte Anzeige wann immer möglich; Spinner nur bei unbekannter Dauer; immer am selben Ort.

**Modalität**
- Sheets nur für abgeschlossene, kurze Aufgaben; eines zur Zeit; „Abbrechen“ leading, Bestätigen („Hinzufügen“, „Fertig“) trailing; nie Abbrechen+Fertig+Zurück zugleich; bei ungesicherten Änderungen vor dem Schließen nachfragen; Esc schließt.
- Alerts sparsam: nur für Kritisches/Destruktives, nie für reine Info, nie beim Start; Titel beschreibt Situation; Buttons konkret („Löschen“, nicht „OK“); destruktiv rot + immer „Abbrechen“.
- Auswahl zu einer bewussten Aktion → Action Sheet, nicht Alert.
- Häufige, rückgängig machbare Aktionen (abhaken, löschen mit Undo) → **kein** Alert, stattdessen Undo-Hinweis.

**Feedback, Laden, Leerzustände**
- Status in die Oberfläche integrieren (Badges, Fortschrittsringe) statt Pop-ups.
- Sofort etwas zeigen (Skeleton/Platzhalter), andere Arbeit währenddessen erlauben.
- Leere Ansichten: klar sagen, was fehlt + nächster Schritt als Button.
- Fehler: was ist passiert, warum, was tun – in normaler Sprache, ohne Schuldzuweisung.

**Motion**
- Bewegung nur mit Zweck, kurz und präzise; häufige Interaktionen nicht animieren; abbrechbar.
- `prefers-reduced-motion`: Bewegungen durch Überblendungen ersetzen, kein Bounce, keine Blur-Animationen.

**Materialien (Liquid Glass)**
- Glas nur in der Funktionsebene (Tab-Bar, Toolbar, Sidebar, schwebende Controls), nie im Inhalt; sparsam.
- Web: `backdrop-filter: blur() saturate()` + halbtransparente Fläche; bei `prefers-reduced-transparency` bzw. fehlender Unterstützung opake Fläche.
- Farbe auf Glas nur für Primäraktionen (Hintergrund einfärben, nicht Symbol).

**Barrierefreiheit**
- Semantisches HTML (`button`, `nav`, `main`, `dialog`, Überschriften-Hierarchie), `aria-label` für Symbol-Buttons, `aria-current` für Navigation.
- Vollständig per Tastatur bedienbar, sichtbarer Fokusring, logische Tab-Reihenfolge.
- Diagramme: Textzusammenfassung + Beschriftungen; nicht nur Farbe.
- Zeitlimits vermeiden; bei schwer umkehrbaren Aktionen bestätigen.

**Benachrichtigungen**
- Dringlichkeit ehrlich: passiv / aktiv / zeitkritisch. Zeitkritisch nur, wenn jetzt relevant. Nutzer muss Benachrichtigungen in der App steuern können (Zeitfenster, Kanäle).

**Onboarding**
- Durch Benutzung lehren; kontextbezogene Tipps statt langer Tour; optional & überspringbar; Einrichtung nicht-essenzieller Dinge aufschieben; Demo-Inhalte erlauben.

## Web-Umsetzung

- Tokens: `assets/hig-tokens.css` einbinden (enthält Light/Dark, Increased Contrast, Reduced Motion/Transparency).
- Komponentenmuster mit HTML-Gerüsten: `references/components.md`.
- Muster (Suche, Dateneingabe, Diagramme, Leerzustände …): `references/patterns.md`.
- Sprache & Texte (Deutsch): `references/writing.md`.
- **SF Symbols** dürfen laut Lizenz nur in Apps für Apple-Plattformen verwendet werden. Im Web: eigene Linien-Icons im SF-Stil (2px-Strich bei 24px, runde Enden, optisch an Textgewicht angeglichen), immer mit Textlabel oder `aria-label`.

## Abnahme-Checkliste (vor jedem Commit abhaken)

- [ ] Eine klare Hauptaufgabe je Screen, oben/leading
- [ ] Compact: Tab-Bar (3–5, Label+Icon) · Regular: Sidebar, Auswahl hervorgehoben
- [ ] Large Title, Titel ≠ App-Name, Zurück-Navigation vorhanden
- [ ] Nur semantische Tokens, Light+Dark geprüft, Kontrast ≥ 4,5:1
- [ ] Textstile aus der Typo-Skala, nichts < 11 pt, keine dünnen Schnitte
- [ ] Alle Ziele ≥ 44 pt, Gedrückt- und Fokus-Zustand
- [ ] Max. eine prominente Aktion pro Ansicht; destruktiv rot + Abbrechen
- [ ] Sheets: Abbrechen leading / Bestätigen trailing, Esc, Rückfrage bei Datenverlust
- [ ] Keine Alerts für Info oder rückgängig machbare Aktionen (Undo stattdessen)
- [ ] Leer-, Lade-, Fehlerzustände mit nächstem Schritt
- [ ] Status nie nur über Farbe
- [ ] Tastatur, Screenreader-Labels, `prefers-reduced-motion`
- [ ] Texte: aktiv, kurz, konsistent, Verben auf Buttons
