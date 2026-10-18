// Verbindungstest für entfernte MCP-Server (Streamable HTTP): initialize + tools/list.
async function rpc(url: string, token: string | undefined, body: unknown, sessionId?: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Der MCP-Server lehnt das Token ab.");
  if (!res.ok && res.status !== 202) throw new Error(`MCP-Server antwortet mit ${res.status}`);
  const text = await res.text();
  const session = res.headers.get("Mcp-Session-Id") ?? sessionId;
  // Antwort kann JSON oder ein SSE-Strom sein
  const dataLine = text.split("\n").filter((l) => l.startsWith("data:")).pop();
  const parsed = text.trim().startsWith("{") ? JSON.parse(text) : dataLine ? JSON.parse(dataLine.slice(5)) : {};
  return { parsed, session };
}

export async function testMcp(url: string, token?: string): Promise<string> {
  if (!url?.startsWith("https://")) throw new Error("Die MCP-URL muss öffentlich per https erreichbar sein.");
  const init = await rpc(url, token, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dom", version: "1.0" } },
  });
  if (init.parsed.error) throw new Error(init.parsed.error.message);
  await rpc(url, token, { jsonrpc: "2.0", method: "notifications/initialized" }, init.session ?? undefined);
  const list = await rpc(url, token, { jsonrpc: "2.0", id: 2, method: "tools/list" }, init.session ?? undefined);
  const tools = (list.parsed.result?.tools ?? []).map((t: { name: string }) => t.name);
  const server = init.parsed.result?.serverInfo?.name ?? "MCP-Server";
  return `${server}: ${tools.length} Werkzeuge${tools.length ? ` (${tools.slice(0, 6).join(", ")}${tools.length > 6 ? " …" : ""})` : ""}`;
}
