#!/usr/bin/env python3
"""
DOM-Desktop-Brücke
==================
Verbindet Programme auf deinem Rechner mit DOM:
  • Blender  – über das Add-on „Blender MCP“ (lokaler Port 9876): Stückliste, Szeneninfo, Rendering, Python
  • AutoCAD/SketchUp-Exporte – Dateien im Ordner ~/DOM-Eingang werden automatisch ins gewählte Projekt hochgeladen

Start:   python3 dom_bridge.py
Beim ersten Start fragt die Brücke nach Server-Adresse und Brücken-Token
(DOM → Einstellungen → Konnektoren → Desktop-Brücke). Nur Python 3.8+ nötig, keine Zusatzpakete.
"""
import base64
import json
import os
import platform
import re
import socket
import sys
import time
import urllib.error
import urllib.request

CONFIG_PATH = os.path.expanduser("~/.dom_bridge.json")
INBOX = os.path.expanduser("~/DOM-Eingang")
BLENDER_PORT = int(os.environ.get("DOM_BLENDER_PORT", "9876"))
POLL_SECONDS = 10
MARK = "@@DOM@@"


# ---------------------------------------------------------------- Konfiguration

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    print("DOM-Desktop-Brücke – Ersteinrichtung\n")
    server = input("Server-Adresse (aus DOM kopieren): ").strip().rstrip("/")
    token = input("Brücken-Token: ").strip()
    cfg = {"server": server, "token": token, "project_id": None}
    save_config(cfg)
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    os.chmod(CONFIG_PATH, 0o600)


def api(cfg, path, body=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        cfg["server"] + path, data=data, method=method or ("POST" if data else "GET"),
        headers={"X-DOM-Token": cfg["token"], "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode() or "{}")


def choose_project(cfg):
    projects = api(cfg, "/bridge/projects").get("projects", [])
    if not projects:
        print("Keine aktiven Projekte gefunden.")
        return
    print("\nIn welches Projekt sollen Dateien aus ~/DOM-Eingang?")
    for i, p in enumerate(projects, 1):
        print(f"  {i}. {p['name']}")
    choice = input("Nummer (Enter = später): ").strip()
    if choice.isdigit() and 1 <= int(choice) <= len(projects):
        cfg["project_id"] = projects[int(choice) - 1]["id"]
        save_config(cfg)
        print(f"→ {projects[int(choice) - 1]['name']}")


# ---------------------------------------------------------------- Blender (Blender-MCP-Add-on)

def blender(command):
    with socket.create_connection(("127.0.0.1", BLENDER_PORT), timeout=10) as s:
        s.settimeout(300)
        s.sendall(json.dumps(command).encode())
        buf = b""
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
            try:
                return json.loads(buf.decode())
            except json.JSONDecodeError:
                continue
    return json.loads(buf.decode())


def blender_code(code):
    res = blender({"type": "execute_code", "params": {"code": code}})
    if res.get("status") == "error":
        raise RuntimeError(res.get("message", "Blender-Fehler"))
    out = res.get("result", {})
    text = out.get("result", "") if isinstance(out, dict) else str(out)
    m = re.search(re.escape(MARK) + r"(.*?)" + re.escape(MARK), text, re.S)
    return json.loads(m.group(1)) if m else {"output": text}


BOM_CODE = r'''
import bpy, json, re
counts = {}
for o in bpy.context.scene.objects:
    if o.type not in {"MESH", "EMPTY"} or o.hide_get():
        continue
    if o.parent is not None and o.type == "MESH" and o.parent.type == "EMPTY":
        continue  # Teile einer Gruppe zählen über das Elternobjekt
    name = o.get("dom_name") or re.sub(r"\.\d{3}$", "", o.name)
    room = o.get("dom_raum") or (o.users_collection[0].name if o.users_collection else None)
    if room in ("Collection", "Scene Collection"):
        room = None
    key = (name, room, o.get("dom_artikelnr"))
    e = counts.setdefault(key, {"name": name, "room": room, "quantity": 0, "category": o.get("dom_kategorie"),
        "manufacturer": o.get("dom_hersteller"), "article_no": o.get("dom_artikelnr"), "unit_price_est": o.get("dom_preis")})
    e["quantity"] += 1
print("@@DOM@@" + json.dumps({"items": list(counts.values())}) + "@@DOM@@")
'''

RENDER_CODE = r'''
import bpy, base64, tempfile, os, json
path = os.path.join(tempfile.gettempdir(), "dom_render.png")
scene = bpy.context.scene
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = path
bpy.ops.render.render(write_still=True)
with open(path, "rb") as f:
    data = base64.b64encode(f.read()).decode()
print("@@DOM@@" + json.dumps({"image_base64": data, "image_name": "blender-render.png", "image_mime": "image/png"}) + "@@DOM@@")
'''


def run_job(job):
    action = job["action"]
    if job["target"] != "blender":
        raise RuntimeError(f"{job['target']} wird über die eigene Erweiterung gesteuert, nicht über die Brücke.")
    if action == "stueckliste_export":
        return blender_code(BOM_CODE)
    if action == "render":
        return blender_code(RENDER_CODE)
    if action == "szene_info":
        return {"scene": blender({"type": "get_scene_info", "params": {}}).get("result")}
    if action == "python":
        return blender_code(job.get("payload", {}).get("code", ""))
    raise RuntimeError(f"Unbekannte Aktion: {action}")


def blender_available():
    try:
        with socket.create_connection(("127.0.0.1", BLENDER_PORT), timeout=1):
            return True
    except OSError:
        return False


# ---------------------------------------------------------------- Eingangsordner (AutoCAD/SketchUp-Exporte)

def sync_inbox(cfg, seen):
    os.makedirs(INBOX, exist_ok=True)
    for name in sorted(os.listdir(INBOX)):
        path = os.path.join(INBOX, name)
        if name.startswith(".") or not os.path.isfile(path) or path in seen:
            continue
        if time.time() - os.path.getmtime(path) < 3:
            continue  # Datei wird noch geschrieben
        if not cfg.get("project_id"):
            print(f"„{name}“ wartet – kein Projekt gewählt (python3 dom_bridge.py --projekt).")
            seen.add(path)
            continue
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        ext = name.lower().rsplit(".", 1)[-1]
        mime = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "csv": "text/csv", "dxf": "image/vnd.dxf"}.get(ext, "application/octet-stream")
        api(cfg, "/bridge/upload", {"project_id": cfg["project_id"], "name": name, "mime": mime, "base64": data, "kind": "cad" if ext in ("dwg", "dxf", "skp", "blend", "csv") else "dokument"})
        done = os.path.join(INBOX, "hochgeladen")
        os.makedirs(done, exist_ok=True)
        os.replace(path, os.path.join(done, name))
        print(f"↑ {name} hochgeladen")


# ---------------------------------------------------------------- Hauptschleife

def main():
    cfg = load_config()
    if "--projekt" in sys.argv or not cfg.get("project_id"):
        try:
            choose_project(cfg)
        except urllib.error.HTTPError as e:
            sys.exit(f"Verbindung abgelehnt ({e.code}). Stimmen Server-Adresse und Token? Datei {CONFIG_PATH} löschen, um neu einzurichten.")
    print(f"\nDOM-Desktop-Brücke läuft. Eingangsordner: {INBOX}\nBeenden mit Strg+C.\n")
    seen = set()
    while True:
        try:
            programs = (["Blender"] if blender_available() else []) + ["Eingangsordner"]
            api(cfg, "/bridge/ping", {"hostname": platform.node(), "programs": programs})
            for job in api(cfg, "/bridge/jobs?targets=blender").get("jobs", []):
                print(f"→ {job['target']}: {job['action']}")
                try:
                    result = run_job(job)
                    api(cfg, f"/bridge/jobs/{job['id']}", {"status": "fertig", "result": result})
                    print("  fertig")
                except Exception as e:  # Fehler an DOM melden statt die Brücke zu beenden
                    api(cfg, f"/bridge/jobs/{job['id']}", {"status": "fehler", "result": {"error": str(e)}})
                    print(f"  Fehler: {e}")
            sync_inbox(cfg, seen)
        except urllib.error.URLError as e:
            print(f"Keine Verbindung zu DOM ({e}). Neuer Versuch in {POLL_SECONDS} s.")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBeendet.")
