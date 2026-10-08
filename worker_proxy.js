const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function corsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(body, { ...init, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }

    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/") {
      return corsResponse("Umut IPTV Proxy aktiv");
    }

    if (requestUrl.pathname !== "/player_api.php") {
      return corsResponse("Not found", { status: 404 });
    }

    if (!env.IPTV_SERVER || !env.IPTV_USERNAME || !env.IPTV_PASSWORD) {
      return corsResponse("IPTV Secrets fehlen", { status: 500 });
    }

    const target = new URL(env.IPTV_SERVER);
    target.pathname = "/player_api.php";
    target.search = "";

    target.searchParams.set("username", env.IPTV_USERNAME);
    target.searchParams.set("password", env.IPTV_PASSWORD);

    for (const [key, value] of requestUrl.searchParams) {
      if (key !== "username" && key !== "password") {
        target.searchParams.append(key, value);
      }
    }

    try {
      const response = await fetch(target.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "Umut-IPTV-Proxy/1.0"
        }
      });

      const body = await response.arrayBuffer();

      return corsResponse(body, {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("Content-Type") ||
            "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      return corsResponse(
        JSON.stringify({
          error: "IPTV-Server konnte nicht erreicht werden"
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }
  }
};
