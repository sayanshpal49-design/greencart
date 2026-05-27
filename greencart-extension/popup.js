const $ = (id) => document.getElementById(id);

function parseNum(inputEl) {
  const v = Number(inputEl.value);
  return Number.isFinite(v) ? v : null;
}

function setStatus(msg) {
  const el = $("status");
  el.textContent = msg || "";
}

function setResult(text) {
  $("result").textContent = text || "";
}

function sendCalculateMessage(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "CALCULATE", payload },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "No response from content script." });
      }
    );
  });
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0) return null;
  return tabs[0].id ?? null;
}

document.getElementById("calculateBtn").addEventListener("click", async () => {
  setStatus("Calculating...");
  setResult("");

  const destinationLat = parseNum($("destinationLat"));
  const destinationLng = parseNum($("destinationLng"));
  const useExtractedOrigins = $("useExtractedOrigins").checked;

  const fallbackOriginLat = parseNum($("fallbackOriginLat"));
  const fallbackOriginLng = parseNum($("fallbackOriginLng"));
  const cartWeightKg = parseNum($("cartWeightKg")) ?? 1;

  if (destinationLat === null || destinationLng === null) {
    setStatus("Enter valid destination latitude/longitude.");
    return;
  }

  const tabId = await getActiveTabId();
  if (tabId === null) {
    setStatus("Could not find an active tab.");
    return;
  }

  const response = await sendCalculateMessage(tabId, {
    destination: { lat: destinationLat, lng: destinationLng },
    useExtractedOrigins,
    fallbackOrigin: {
      lat: fallbackOriginLat,
      lng: fallbackOriginLng,
    },
    cartWeightKg,
  });

  if (!response.ok) {
    setStatus(response.error || "Failed to calculate.");
    return;
  }

  setStatus("Done.");
  setResult(response.data.resultText || "");
});

