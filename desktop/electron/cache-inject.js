/**
 * Se inyecta en la página (origen Vercel/local).
 * Intercepta GET /api/panel/* → responde desde localStorage al instante
 * y actualiza la caché en segundo plano.
 */
(function () {
  if (window.__backstageDesktopCache) return;
  window.__backstageDesktopCache = true;

  var PREFIX = "bs-exe-cache-v1:";
  var TTL = 24 * 60 * 60 * 1000;
  var FRESH_MS = 90 * 1000;
  var origFetch = window.fetch.bind(window);

  function absUrl(input) {
    var raw = typeof input === "string" ? input : input && input.url;
    try {
      return new URL(raw, location.origin).href;
    } catch (e) {
      return String(raw || "");
    }
  }

  function shouldCache(url, init) {
    var method = ((init && init.method) || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return false;
    try {
      var u = new URL(url, location.origin);
      return u.pathname.indexOf("/api/panel/") === 0;
    } catch (e) {
      return false;
    }
  }

  function read(url) {
    try {
      var raw = localStorage.getItem(PREFIX + url);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || entry.d == null) return null;
      if (Date.now() - (entry.t || 0) > TTL) return null;
      return entry;
    } catch (e) {
      return null;
    }
  }

  function write(url, data) {
    try {
      localStorage.setItem(
        PREFIX + url,
        JSON.stringify({ t: Date.now(), d: data })
      );
    } catch (e) {
      try {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) keys.push(k);
        }
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(function (k) {
          localStorage.removeItem(k);
        });
        localStorage.setItem(
          PREFIX + url,
          JSON.stringify({ t: Date.now(), d: data })
        );
      } catch (e2) {
        /* ignore quota */
      }
    }
  }

  function cachedResponse(data) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-backstage-cache": "HIT",
      },
    });
  }

  function networkAndStore(input, init, url) {
    return origFetch(input, init).then(function (res) {
      if (res.ok) {
        res
          .clone()
          .json()
          .then(function (data) {
            write(url, data);
          })
          .catch(function () {});
      }
      return res;
    });
  }

  window.fetch = function (input, init) {
    var url = absUrl(input);
    if (!shouldCache(url, init || {})) {
      return origFetch(input, init);
    }

    var hit = read(url);
    var net = networkAndStore(input, init, url);

    if (hit) {
      // Actualiza en segundo plano; responde ya
      net.catch(function () {});
      return Promise.resolve(cachedResponse(hit.d));
    }

    return net;
  };

  // Precarga endpoints frecuentes tras login / carga
  function warm() {
    if (!location.pathname || location.pathname.indexOf("/a/") !== 0) return;
    var period = new Date();
    var ym =
      period.getFullYear() +
      "-" +
      String(period.getMonth() + 1).padStart(2, "0");
    var urls = [
      "/api/panel/creators",
      "/api/panel/dashboard?period=" + ym,
      "/api/panel/hub?period=" + ym,
      "/api/panel/diamonds?period=" + ym,
      "/api/panel/livecoins",
      "/api/panel/metrics",
      "/api/panel/ops",
      "/api/panel/tasks?period=" + ym,
      "/api/panel/kpi?period=" + ym,
      "/api/panel/bonos?period=" + ym,
      "/api/panel/managers",
    ];
    urls.forEach(function (u, i) {
      setTimeout(function () {
        window.fetch(u).catch(function () {});
      }, 400 + i * 120);
    });
  }

  if (document.readyState === "complete") {
    setTimeout(warm, 800);
  } else {
    window.addEventListener("load", function () {
      setTimeout(warm, 800);
    });
  }
})();
