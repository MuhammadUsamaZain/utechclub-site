(() => {
  const DEVICE_ID_KEY = "utech_device_id";
  const RECORDED_INSTALL_KEY = "utech_install_recorded";
  const STANDALONE_COUNTED_KEY = "utech_standalone_counted";
  const config = window.UTECH_CONFIG || { SUPABASE_URL: "", SUPABASE_ANON_KEY: "" };
  const installButton = document.getElementById("install-app-button");
  const installCount = document.getElementById("install-count");
  const mobileMedia = window.matchMedia("(max-width: 767px)");
  let deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        deviceId = window.crypto.randomUUID();
      } else {
        deviceId = `device-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      }
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }

  function isCounterEnabled() {
    return Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
  }

  async function fetchInstallCount() {
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/rpc/get_installs_count`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.SUPABASE_ANON_KEY
      },
      body: "{}"
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch installs count (${response.status})`);
    }

    const data = await response.json();
    if (typeof data === "number") {
      return data;
    }
    if (Array.isArray(data) && typeof data[0]?.count === "number") {
      return data[0].count;
    }
    return Number(data) || 0;
  }

  async function renderInstallCount() {
    if (!installCount) {
      return;
    }

    if (!isCounterEnabled()) {
      installCount.hidden = true;
      return;
    }

    try {
      const count = await fetchInstallCount();
      installCount.textContent = `${count.toLocaleString()} installs`;
      installCount.hidden = false;
    } catch {
      installCount.hidden = true;
    }
  }

  async function recordInstall(source) {
    if (!isCounterEnabled()) {
      return;
    }

    const payload = {
      device_id: getDeviceId(),
      source,
      installed_at: new Date().toISOString()
    };

    try {
      await fetch(`${config.SUPABASE_URL}/rest/v1/installs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.SUPABASE_ANON_KEY,
          Prefer: "resolution=ignore-duplicates,return=minimal"
        },
        body: JSON.stringify(payload)
      });
      await renderInstallCount();
    } catch {
      // Keep page functional even if counter backend is unavailable.
    }
  }

  function updateInstallButtonVisibility() {
    if (!installButton) {
      return;
    }

    const alreadyInstalled = localStorage.getItem(RECORDED_INSTALL_KEY) === "true" || isStandalone();
    installButton.hidden = !(mobileMedia.matches && !alreadyInstalled && deferredPrompt);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const appScript = document.querySelector("script[data-utech-app]");
    if (!appScript?.src) {
      return;
    }

    const swUrl = new URL("sw.js", appScript.src).toString();
    navigator.serviceWorker.register(swUrl).catch(() => {
      // Silent fail to avoid blocking the main site if SW registration fails.
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallButtonVisibility();
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(RECORDED_INSTALL_KEY, "true");
    deferredPrompt = null;
    updateInstallButtonVisibility();
    recordInstall("appinstalled");
  });

  mobileMedia.addEventListener("change", updateInstallButtonVisibility);

  if (installButton) {
    installButton.addEventListener("click", async () => {
      if (!deferredPrompt) {
        return;
      }
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } finally {
        deferredPrompt = null;
        updateInstallButtonVisibility();
      }
    });
  }

  if (isStandalone() && localStorage.getItem(STANDALONE_COUNTED_KEY) !== "true") {
    localStorage.setItem(STANDALONE_COUNTED_KEY, "true");
    localStorage.setItem(RECORDED_INSTALL_KEY, "true");
    recordInstall("standalone_launch");
  }

  registerServiceWorker();
  renderInstallCount();
  updateInstallButtonVisibility();
})();
