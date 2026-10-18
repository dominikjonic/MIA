# DOM – Büromöblierung & Umzugskoordination

Projektsoftware mit KI-Assistent: Projekte von Naturmaß bis Abnahme, Budgetüberwachung, Ausschreibungen mit Preisspiegel,
Termine, Doku mit Fotos, Umzugsplanung – und ein Assistent, der per App und WhatsApp erinnert, berichtet und E-Mails schreibt.
Gestaltet nach den Apple Human Interface Guidelines (Skill: `.claude/skills/apple-hig`).

**App:** https://dom-three-pi.vercel.app  ·  läuft auf iPhone, iPad und Mac im Browser – „Zum Home-Bildschirm“ macht sie zur App.

---

## Was DOM kann

| Bereich | Funktionen |
|---|---|
| **Heute** | Termine, fällige und überfällige Aufgaben, Budgetwarnungen, Stand aller Projekte |
| **Projekte** | Neues Projekt → automatisch 13 Phasen mit Aufgaben und Terminen: Projektanlage, Naturmaß, Konzept/Entwurf, Planung, Trockenbauplanung, Möblierung & Stückliste, Visualisierung, Ausschreibung, Angebotsvergleich, Auftragsvergabe, Terminierung, Umzug, Projektüberwachung & Abnahme |
| **Budget** | 8 Kategorien (Planung, Trockenbau, Möbel, Elektro & IT, Boden & Malerei, Akustik & Licht, Umzug, Reserve), Plan / beauftragt / abgerechnet / Prognose, Warnung bei Überschreitung |
| **Stückliste** | nach Räumen, Import aus SketchUp (Bericht/Erweiterung), AutoCAD (DXF oder Datenextraktion), Excel/CSV, Blender (Brücke); Export als CSV |
| **Ausschreibungen** | aus der Stückliste erstellen, Bieter verwalten, Anfrage-E-Mail per KI, Angebote erfassen, **Preisspiegel** mit Bestpreisen, Vollständigkeit, Lieferzeit, Budgetabgleich und Empfehlung, Vergabe bucht automatisch ins Budget, Absagen/Auftragsbestätigung per KI |
| **Termine** | Besichtigung, Aufmaß, Präsentation, Lieferung, Montage, Umzug, Abnahme; wöchentliche Baustellenbesichtigungen planen; Google-Kalender-Abgleich |
| **Dokumentation** | Bautagebuch mit Fotos – auch per WhatsApp |
| **Dateien & Visualisierung** | Pläne, CAD, Fotos; fotorealistische Visualisierung mit Higgsfield (Prompt schreibt die KI) |
| **Umzug** | Raumzuordnung alt → neu, Personen, Kisten, IT; farbige Etiketten drucken; Infos an Mitarbeiter und Anfrage an Spedition per KI |
| **Assistent** | Chat in der App und über WhatsApp, Morgen-Briefing, Erinnerungen, E-Mail-Entwürfe in Gmail |

Beispiele für den Assistenten (App oder WhatsApp):
- „Was steht heute an?“ · „Wie weit ist die Kanzlei Huber?“ · „Wo wird das Budget knapp?“
- „Aufmaß bei Huber erledigt, Raumhöhe 2,95 m“ → Aufgabe abgehakt + Doku-Eintrag
- „Erinnere mich morgen um 9 an die Angebotsfrist Möbel“
- „Vergleiche die Angebote für Huber und schreib Bene eine Auftragsbestätigung“ → Gmail-Entwurf
- Foto der Baustelle schicken → wird dem Projekt zugeordnet

---

## Einrichtung (einmalig, ca. 30–45 Minuten)

### 1. Konto anlegen
App öffnen → **Registrieren** → Bestätigungs-E-Mail anklicken → anmelden.

> **Einmal im Supabase-Dashboard:** *Authentication → URL Configuration → Site URL* auf `https://dom-three-pi.vercel.app` setzen
> und dieselbe Adresse unter *Redirect URLs* eintragen. Sonst führt der Bestätigungslink auf „localhost“ (das Konto ist trotzdem bestätigt).
> Optional danach unter *Authentication → Sign In / Providers* „Allow new users to sign up“ ausschalten, damit sich niemand sonst registriert.

### 2. Einstellungen
*Einstellungen*: Name, Firma, E-Mail-Signatur, **deine WhatsApp-Nummer** (z. B. `436641234567`), Uhrzeit des Morgen-Briefings.

### 3. Konnektoren (Einstellungen → Konnektoren)

**Claude (KI)** – Pflicht für den Assistenten
1. https://console.anthropic.com → *API Keys* → Schlüssel erstellen (Guthaben aufladen).
2. In DOM eintragen, Modell wählen (Standard: Claude Opus 5.5; günstiger: Sonnet 5.5 oder Haiku 5.5). „Sichern“ prüft die Verbindung.

**WhatsApp** – Assistent im Chat, Briefing, Erinnerungen
1. https://developers.facebook.com/apps → *App erstellen* → Typ *Business* → Produkt **WhatsApp** hinzufügen.
2. Unter *WhatsApp → API-Setup* eine Telefonnummer hinzufügen. Empfehlung: eine **eigene Nummer für den Assistenten**
   (eine Nummer in der WhatsApp-Business-API kann nicht gleichzeitig in der normalen WhatsApp-App genutzt werden).
3. *Business-Einstellungen → System-Benutzer* → dauerhaftes Zugriffstoken mit `whatsapp_business_messaging` erzeugen.
4. In DOM eintragen: **Phone-Number-ID**, **Zugriffstoken**, **App-Geheimnis** (*App-Einstellungen → Allgemein*). Sichern.
5. Zurück bei Meta: *WhatsApp → Konfiguration → Webhook*: URL und Verify-Token aus DOM einfügen, Feld **messages** abonnieren.
6. Schreib der Assistenten-Nummer „Hallo“ – fertig.
7. Damit Briefing und Erinnerungen auch nach 24 Stunden ohne eigene Nachricht ankommen: im WhatsApp-Manager eine Vorlage
   (Kategorie *Utility*, Sprache Deutsch) mit Text `{{1}}` anlegen, z. B. Name `dom_hinweis`, und den Namen in DOM eintragen.

**Google (Gmail & Kalender)** – deine Firmen-E-Mail
1. https://console.cloud.google.com → Projekt anlegen → *APIs & Dienste → Bibliothek*: **Gmail API** und **Google Calendar API** aktivieren.
2. *OAuth-Zustimmungsbildschirm*: bei Google Workspace (Firmenkonto) **Intern** wählen.
   (Bei „Extern/Test“ läuft die Anmeldung nach 7 Tagen ab.)
3. *Anmeldedaten → OAuth-Client-ID → Webanwendung*, autorisierte Weiterleitungs-URI aus DOM einfügen.
4. Client-ID und Client-Secret in DOM eintragen → **Mit Google verbinden**.

**Higgsfield (Visualisierung)**
API-Key-ID und Secret von https://cloud.higgsfield.ai eintragen. Adresse und Modell sind einstellbar
(Standard `https://platform.higgsfield.ai`, Modell `higgsfield-ai/soul/standard`) – falls Higgsfield Pfade ändert, hier anpassen
(siehe docs.higgsfield.ai). Der Test zeigt, ob der Schlüssel akzeptiert wird.

**Desktop-Brücke, Blender, SketchUp, AutoCAD**
- *Desktop-Brücke* einrichten → `dom_bridge.py` herunterladen → im Terminal `python3 dom_bridge.py` → Server und Token aus DOM einfügen.
  - **Blender:** Add-on „Blender MCP“ installieren und in Blender verbinden. Danach z. B. im Assistenten „Hol die Stückliste aus Blender für Huber“.
    Objekte werden nach Name gezählt, Sammlung = Raum; optionale Eigenschaften `dom_hersteller`, `dom_artikelnr`, `dom_preis`, `dom_kategorie`.
  - **AutoCAD/SketchUp-Exporte:** Dateien in `~/DOM-Eingang` werden automatisch ins gewählte Projekt hochgeladen.
- **SketchUp-Erweiterung** `dom_sketchup.rb`: *Erweiterungen → DOM → Verbinden / Stückliste senden / Ansicht als Bild senden*.
  Komponenten werden nach Definition gezählt, Tag = Raum.
- **AutoCAD ohne Zusatzsoftware:** Zeichnung als DXF speichern oder `DATENEXTRAKTION` als CSV → in der Stückliste importieren.
- **MCP-Modus:** Läuft ein MCP-Server (Blender, SketchUp, AutoCAD oder beliebig) öffentlich per https (z. B. über einen Tunnel),
  die URL eintragen – der Assistent nutzt dann dessen Werkzeuge direkt. Unter *Weiterer MCP-Server* lassen sich beliebig viele hinzufügen.

---

## Technik

```
Browser/PWA (Vercel, statisch)  ──►  Supabase (Frankfurt, EU)
  dom/web                              ├─ Postgres + Row Level Security   (dom/supabase/migrations)
                                       ├─ Auth, Datei-Speicher
                                       ├─ Edge Function „dom“              (dom/supabase/functions/dom)
                                       │    KI-Agent (Claude + Werkzeuge + MCP), WhatsApp-Webhook,
                                       │    Gmail/Kalender, Higgsfield, Desktop-Brücke, Konnektoren
                                       └─ pg_cron: jede Minute Erinnerungen, Termine, Briefing
Desktop: dom_bridge.py (Blender-MCP, Eingangsordner) · dom_sketchup.rb
```

- Schlüssel der Konnektoren liegen in `connector_secrets` (nur für die Server-Funktion lesbar), nie im Browser.
- Budget-, Angebots- und Fortschrittsberechnung als SQL-Views – App und KI rechnen identisch.
- Supabase-Projekt `dom` (`dvtklaupmioxheelndnq`), Vercel-Projekt `dom`.

**Lokaler Oberflächentest** (Beispieldaten, ohne Konto): `cd dom && python3 -m http.server 8765` → http://127.0.0.1:8765/test/index.html

**Neu veröffentlichen:** Vercel-Projekt `dom` (Root `dom/web`, ohne Build). Server-Funktion: `supabase functions deploy dom --no-verify-jwt`.

**Kosten (Richtwerte):** Supabase und Vercel im Gratis-Tarif; Claude nach Nutzung (typisch wenige Euro pro Monat bei normalem Gebrauch);
WhatsApp: Antworten innerhalb von 24 h frei, Vorlagen-Nachrichten (Briefing ohne vorherige Nachricht) wenige Cent; Higgsfield pro Bild.
