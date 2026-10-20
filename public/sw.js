// Service worker: shows pushes from the notifier (specs/notifications.md) and opens their page on tap.
// No caching or offline mode: the stats change all the time, so every page comes from the server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(p.title || "Rokomet stats", {
      body: p.body || "",
      tag: p.tag,
      icon: "/icon/192",
      data: { url: p.url || "/stats" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/stats", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = open.find((c) => c.url === url) || open[0];
      if (same) {
        if (same.url !== url && "navigate" in same) await same.navigate(url);
        return same.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
