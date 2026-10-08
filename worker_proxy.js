const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges"
};

function corsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(body, { ...init, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsResponse(null, { status: 204 });
    if (request.method !== "GET") return corsResponse("Method not allowed", { status: 405 });

    if (!env.IPTV_SERVER || !env.IPTV_USERNAME || !env.IPTV_PASSWORD) {
      return corsResponse("IPTV Secrets fehlen", { status: 500 });
    }

    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/") {
      return corsResponse("Umut IPTV Proxy aktiv");
    }

    const server = new URL(env.IPTV_SERVER);

    if (requestUrl.pathname === "/player_api.php") {
      server.pathname = "/player_api.php";
      server.search = "";
      server.searchParams.set("username", env.IPTV_USERNAME);
      server.searchParams.set("password", env.IPTV_PASSWORD);

      for (const [key, value] of requestUrl.searchParams) {
        if (key !== "username" && key !== "password") server.searchParams.append(key, value);
      }

      try {
        const response = await fetch(server.toString(), {
          headers: { "User-Agent": "Umut-IPTV-Proxy/1.0" }
        });

        return corsResponse(await response.arrayBuffer(), {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      } catch {
        return corsResponse(JSON.stringify({ error: "IPTV-Server konnte nicht erreicht werden" }), {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    const match = requestUrl.pathname.match(/^\/(?:live|stream)\/([^/]+)\.(m3u8|ts)$/);
    if (!match) return corsResponse("Not found", { status: 404 });

    const streamId = decodeURIComponent(match[1]);
    const extension = match[2];

    server.pathname =
      `/live/${encodeURIComponent(env.IPTV_USERNAME)}/` +
      `${encodeURIComponent(env.IPTV_PASSWORD)}/` +
      `${encodeURIComponent(streamId)}.${extension}`;
    server.search = requestUrl.search;

    const headers = new Headers({ "User-Agent": "Umut-IPTV-Proxy/1.0" });
    const range = request.headers.get("Range");
    if (range) headers.set("Range", range);

    try {
      const response = await fetch(server.toString(), { headers, redirect: "follow" });
      const outHeaders = {
        "Content-Type": response.headers.get("Content-Type") ||
          (extension === "m3u8" ? "application/vnd.apple.mpegurl" : "video/mp2t"),
        "Cache-Control": "no-store"
      };

      for (const name of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
        const value = response.headers.get(name);
        if (value) outHeaders[name] = value;
      }

      return corsResponse(response.body, {
        status: response.status,
        headers: outHeaders
      });
    } catch {
      return corsResponse("Stream konnte nicht erreicht werden", { status: 502 });
    }
  }
};
