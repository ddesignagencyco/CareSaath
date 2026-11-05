/* CareSaath web push service worker. Shows a notification for each push and
   focuses (or opens) the app on click. Payload shape: { title, body, data }. */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const title = payload.title || "CareSaath";
  const data = payload.data || {};
  const url = data.url || "/";
  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url },
    tag: data.tag,
  };
  if (data.call) {
    // Incoming call: keep it on screen until acted on, and ring/vibrate like a phone.
    // `renotify` requires a tag, so fall back to one derived from the call id.
    options.tag = data.tag || "call-" + (data.callId || "incoming");
    options.requireInteraction = true;
    options.renotify = true;
    options.vibrate = [400, 200, 400, 200, 400, 1000, 400, 200, 400, 200, 400];
  } else if (data.callId && !data.tag) {
    // A follow-up about the same call (e.g. "Missed call") replaces the sticky incoming-call one.
    options.tag = "call-" + data.callId;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.focus();
          if ("navigate" in w) w.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
