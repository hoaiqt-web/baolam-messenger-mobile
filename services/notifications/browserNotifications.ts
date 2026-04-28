const CHAT_NOTIFICATIONS_ENABLED_KEY = "chat.notifications.enabled";
const CHAT_NOTIFICATIONS_DEBUG_KEY = "chat.notifications.debug";

export type BrowserNotificationPermission = NotificationPermission | "unsupported";

type NotifyMessageInput = {
  title: string;
  body: string;
  tag?: string;
};

export type NotifyBrowserMessageResult =
  | { ok: true; notification: Notification }
  | { ok: false; reason: "unsupported" | "permission_not_granted" | "create_failed" };

function isBrowserEnvironment() {
  return typeof window !== "undefined";
}

export function isBrowserNotificationSupported() {
  return (
    isBrowserEnvironment() &&
    "Notification" in window &&
    typeof window.Notification === "function"
  );
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export function loadBrowserNotificationsEnabled() {
  if (!isBrowserEnvironment()) {
    return false;
  }

  const value = window.localStorage.getItem(CHAT_NOTIFICATIONS_ENABLED_KEY);
  if (value === null) {
    return false;
  }

  return value === "1";
}

export function setBrowserNotificationsEnabled(enabled: boolean) {
  if (!isBrowserEnvironment()) {
    return;
  }

  if (enabled) {
    window.localStorage.setItem(CHAT_NOTIFICATIONS_ENABLED_KEY, "1");
    return;
  }

  window.localStorage.setItem(CHAT_NOTIFICATIONS_ENABLED_KEY, "0");
}

export function isBrowserNotificationsDebugEnabled() {
  if (!isBrowserEnvironment()) {
    return false;
  }

  return window.localStorage.getItem(CHAT_NOTIFICATIONS_DEBUG_KEY) === "1";
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) {
    return "unsupported" as const;
  }

  return window.Notification.requestPermission();
}

export function notifyBrowserMessage({ title, body, tag }: NotifyMessageInput): NotifyBrowserMessageResult {
  if (!isBrowserNotificationSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  if (window.Notification.permission !== "granted") {
    return { ok: false, reason: "permission_not_granted" };
  }

  try {
    const notification = new window.Notification(title, {
      body,
      tag,
      silent: false,
    });
    return { ok: true, notification };
  } catch {
    return { ok: false, reason: "create_failed" };
  }
}

export function playNotificationSound() {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    const audio = new Audio("/assets/sounds/sound-effect-notification.mp3");
    void audio.play().catch((error) => {
      // Browser often blocks auto-play until first interaction
      console.warn("Failed to play notification sound:", error);
    });
  } catch (error) {
    console.error("Error creating/playing notification sound:", error);
  }
}
