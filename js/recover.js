// Shown when an app fails to start (for example, an update left a mix of old and new files in the
// offline copy). "Repair" removes the offline copy and reloads; settings and history are kept.
// Plain script (not a module) so it runs even when the app's modules fail to load.
(function () {
  var script = document.currentScript;
  var appVar = script && script.getAttribute("data-app");
  var errors = [];
  window.addEventListener("error", function (e) { errors.push(e.message || String(e.error || "error")); });
  window.addEventListener("unhandledrejection", function (e) { errors.push(String((e.reason && e.reason.message) || e.reason)); });

  function repair() {
    var jobs = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    // Re-download this app's files (listed in its sw.js) past the browser's short-term cache too.
    var sw = new URL("sw.js", location.href);
    jobs.push(fetch(sw, { cache: "reload" }).then(function (r) { return r.text(); }).then(function (text) {
      var files = (text.match(/"[^"\s]+\.(js|css|html)"/g) || []).map(function (q) { return q.slice(1, -1); });
      files.push("./");
      return Promise.all(files.map(function (f) { return fetch(new URL(f, sw), { cache: "reload" }).catch(function () {}); }));
    }));
    Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
  }

  function show() {
    if (document.getElementById("recoverBanner")) return;
    var box = document.createElement("div");
    box.id = "recoverBanner";
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;z-index:99;left:12px;right:12px;top:calc(env(safe-area-inset-top) + 12px);" +
      "background:#2a2a2a;color:#fff;border:2px solid #ff7a7a;border-radius:12px;padding:14px;font:15px/1.4 -apple-system,system-ui,sans-serif";
    var msg = document.createElement("div");
    msg.textContent = "This app did not load properly. Repair downloads a fresh copy; your settings and history are kept.";
    var detail = document.createElement("div");
    detail.style.cssText = "margin-top:6px;font-size:12px;color:#9e9e9e;word-break:break-word";
    detail.textContent = errors.length ? "Error: " + errors[0] : "";
    var btn = document.createElement("button");
    btn.textContent = "Repair";
    btn.style.cssText = "margin-top:10px;background:#f2f53d;color:#111;border:0;border-radius:8px;padding:9px 18px;font:600 16px -apple-system,system-ui,sans-serif";
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Repairing…";
      repair();
    });
    box.appendChild(msg);
    box.appendChild(detail);
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  window.addEventListener("load", function () {
    setTimeout(function () {
      if (appVar && !window[appVar]) show();
    }, 2500);
  });
})();
