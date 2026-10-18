# DOM-Erweiterung für SketchUp
# Installation: Fenster → Erweiterungs-Manager → Erweiterung installieren (diese .rb-Datei)
#   oder Datei in den Plugins-Ordner kopieren und SketchUp neu starten.
# Menü: Erweiterungen → DOM
#   • Verbinden …            Server-Adresse und Brücken-Token aus DOM eintragen
#   • Projekt wählen …       Ziel-Projekt für Stückliste und Bilder
#   • Stückliste senden      zählt alle Komponenten (nach Definition, Tag/Layer als Raum)
#   • Ansicht als Bild senden aktuelle Ansicht als PNG (z. B. als Referenz für Higgsfield)
# Aufträge aus DOM („Stückliste aus SketchUp holen“) werden automatisch alle 15 Sekunden abgeholt.

require "sketchup.rb"
require "json"
require "net/http"
require "uri"
require "base64"
require "tmpdir"

module DOM
  module SketchUpBridge
    PREFS = "DOM_Bridge".freeze

    def self.setting(key)
      Sketchup.read_default(PREFS, key, "")
    end

    def self.save(key, value)
      Sketchup.write_default(PREFS, key, value)
    end

    def self.request(path, body = nil)
      uri = URI.parse(setting("server") + path)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.read_timeout = 60
      req = body ? Net::HTTP::Post.new(uri.request_uri) : Net::HTTP::Get.new(uri.request_uri)
      req["X-DOM-Token"] = setting("token")
      req["Content-Type"] = "application/json"
      req.body = JSON.generate(body) if body
      res = http.request(req)
      raise "DOM antwortet mit #{res.code}" unless res.is_a?(Net::HTTPSuccess)
      JSON.parse(res.body)
    end

    def self.connect
      input = UI.inputbox(["Server-Adresse", "Brücken-Token"], [setting("server"), setting("token")], "Mit DOM verbinden")
      return unless input
      save("server", input[0].strip.chomp("/"))
      save("token", input[1].strip)
      request("/bridge/ping", { hostname: "SketchUp", programs: ["SketchUp"] })
      UI.messagebox("Verbunden.")
      choose_project
    rescue StandardError => e
      UI.messagebox("Verbindung fehlgeschlagen: #{e.message}")
    end

    def self.choose_project
      projects = request("/bridge/projects")["projects"]
      return UI.messagebox("Keine aktiven Projekte in DOM.") if projects.empty?
      names = projects.map { |p| p["name"] }
      input = UI.inputbox(["Projekt"], [names.first], [names.join("|")], "Projekt wählen")
      return unless input
      save("project_id", projects.find { |p| p["name"] == input[0] }["id"])
    rescue StandardError => e
      UI.messagebox("Fehler: #{e.message}")
    end

    # Komponenten zählen: Definition = Bezeichnung, Tag (Layer) = Raum; Attribute aus „dom“-Wörterbuch.
    def self.collect_items
      counts = Hash.new { |h, k| h[k] = 0 }
      meta = {}
      walk = lambda do |entities|
        entities.each do |e|
          next unless e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)
          next if e.hidden?
          if e.is_a?(Sketchup::ComponentInstance)
            d = e.definition
            room = e.layer && e.layer.name != "Layer0" && e.layer.name != "Untagged" ? e.layer.name : nil
            key = [d.name, room]
            counts[key] += 1
            meta[key] ||= {
              manufacturer: d.get_attribute("dom", "hersteller") || d.get_attribute("dynamic_attributes", "manufacturer"),
              article_no: d.get_attribute("dom", "artikelnr"),
              category: d.get_attribute("dom", "kategorie"),
              unit_price_est: d.get_attribute("dom", "preis"),
            }
          else
            walk.call(e.entities)
          end
        end
      end
      walk.call(Sketchup.active_model.entities)
      counts.map { |(name, room), n| { name: name, room: room, quantity: n }.merge(meta[[name, room]]) }
    end

    def self.send_bom(job_id = nil)
      items = collect_items
      if job_id
        request("/bridge/jobs/#{job_id}", { status: "fertig", result: { items: items } })
      else
        choose_project if setting("project_id").empty?
        r = request("/bridge/import", { project_id: setting("project_id"), source: "sketchup", items: items, replace: true })
        UI.messagebox("#{r['imported']} Positionen an DOM gesendet.")
      end
    rescue StandardError => e
      UI.messagebox("Stückliste konnte nicht gesendet werden: #{e.message}") unless job_id
      request("/bridge/jobs/#{job_id}", { status: "fehler", result: { error: e.message } }) if job_id
    end

    def self.view_png
      path = File.join(Dir.tmpdir, "dom_ansicht.png")
      Sketchup.active_model.active_view.write_image(filename: path, width: 2400, antialias: true, transparent: false)
      Base64.strict_encode64(File.binread(path))
    end

    def self.send_view(job_id = nil)
      data = view_png
      if job_id
        request("/bridge/jobs/#{job_id}", { status: "fertig", result: { image_base64: data, image_name: "sketchup-ansicht.png", image_mime: "image/png" } })
      else
        choose_project if setting("project_id").empty?
        request("/bridge/upload", { project_id: setting("project_id"), name: "sketchup-ansicht.png", mime: "image/png", base64: data, kind: "plan" })
        UI.messagebox("Ansicht an DOM gesendet. Du findest sie unter Pläne & Dateien.")
      end
    rescue StandardError => e
      UI.messagebox("Bild konnte nicht gesendet werden: #{e.message}") unless job_id
    end

    def self.poll
      return if setting("token").empty?
      jobs = request("/bridge/jobs?targets=sketchup")["jobs"]
      jobs.each do |job|
        case job["action"]
        when "stueckliste_export" then send_bom(job["id"])
        when "render", "szene_info" then send_view(job["id"])
        else request("/bridge/jobs/#{job['id']}", { status: "fehler", result: { error: "Aktion in SketchUp nicht verfügbar" } })
        end
      end
    rescue StandardError
      nil # Netzwerkfehler still ignorieren, nächster Versuch folgt
    end

    unless file_loaded?(__FILE__)
      menu = UI.menu("Extensions").add_submenu("DOM")
      menu.add_item("Verbinden …") { connect }
      menu.add_item("Projekt wählen …") { choose_project }
      menu.add_separator
      menu.add_item("Stückliste senden") { send_bom }
      menu.add_item("Ansicht als Bild senden") { send_view }
      UI.start_timer(15, true) { poll }
      file_loaded(__FILE__)
    end
  end
end
