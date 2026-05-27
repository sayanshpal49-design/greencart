const EMISSIONS_FACTOR_KG_CO2_PER_TON_KM = 0.5; // Simplified constant for demo/interview

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius (km)

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function extractItemOriginsFromDOM() {
  // We look for dataset-based coordinates so the project can run on your own test pages.
  // For a real Amazon integration, you would update selectors/attributes to match the DOM.
  const nodes = Array.from(
    document.querySelectorAll("[data-origin-lat][data-origin-lng], [data-item-lat][data-item-lng]")
  );

  return nodes
    .map((node) => {
      const originLat =
        numOrNull(node.dataset.originLat) ?? numOrNull(node.dataset.itemLat);
      const originLng =
        numOrNull(node.dataset.originLng) ?? numOrNull(node.dataset.itemLng);

      const weightKg = numOrNull(node.dataset.weightKg) ?? 0.5;
      const quantity = Math.max(1, Math.floor(numOrNull(node.dataset.quantity) ?? 1));

      if (originLat === null || originLng === null) return null;

      return {
        originLat,
        originLng,
        weightKg: weightKg * quantity,
      };
    })
    .filter(Boolean);
}

function weightedCentroid(items) {
  // items: [{originLat, originLng, weightKg}]
  let totalW = 0;
  let latSum = 0;
  let lngSum = 0;
  for (const it of items) {
    totalW += it.weightKg;
    latSum += it.originLat * it.weightKg;
    lngSum += it.originLng * it.weightKg;
  }
  if (totalW <= 0) return null;
  return { lat: latSum / totalW, lng: lngSum / totalW };
}

function emissionKgForShipment({ fromLat, fromLng, toLat, toLng, weightKg }) {
  const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
  const weightTons = weightKg / 1000;
  return weightTons * distanceKm * EMISSIONS_FACTOR_KG_CO2_PER_TON_KM;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "CALCULATE") return;

  const payload = msg.payload || {};
  const destination = payload.destination || {};
  const destinationLat = numOrNull(destination.lat);
  const destinationLng = numOrNull(destination.lng);

  if (destinationLat === null || destinationLng === null) {
    sendResponse({ ok: false, error: "Missing destination lat/lng." });
    return;
  }

  const fallbackOrigin = payload.fallbackOrigin || {};
  const fallbackLat = numOrNull(fallbackOrigin.lat);
  const fallbackLng = numOrNull(fallbackOrigin.lng);

  const useExtractedOrigins = payload.useExtractedOrigins === true;
  const cartWeightKg = numOrNull(payload.cartWeightKg) ?? 1;

  let extractedItems = [];
  if (useExtractedOrigins) extractedItems = extractItemOriginsFromDOM();

  // If we have no extracted item coordinates, fall back to one “virtual item” shipment.
  if (!extractedItems || extractedItems.length === 0) {
    if (fallbackLat === null || fallbackLng === null) {
      sendResponse({
        ok: false,
        error: "No item origins found and fallback origin lat/lng is missing.",
      });
      return;
    }

    const individualKg = emissionKgForShipment({
      fromLat: fallbackLat,
      fromLng: fallbackLng,
      toLat: destinationLat,
      toLng: destinationLng,
      weightKg: cartWeightKg,
    });

    const resultText = [
      `No item-origin coordinates found in DOM.`,
      `Using fallback origin for a single shipment.`,
      ``,
      `Individual estimate: ${individualKg.toFixed(2)} kg CO2`,
      `Consolidated estimate: ${individualKg.toFixed(2)} kg CO2`,
      `Estimated savings: 0.00 kg CO2`,
    ].join("\n");

    sendResponse({ ok: true, data: { resultText } });
    return;
  }

  // Build per-item shipments. If user chose not to use extracted origins, override origins with fallback.
  const items = extractedItems.map((it) => {
    if (!useExtractedOrigins) {
      return {
        originLat: fallbackLat,
        originLng: fallbackLng,
        weightKg: it.weightKg,
      };
    }
    return it;
  });

  if (!useExtractedOrigins && (fallbackLat === null || fallbackLng === null)) {
    sendResponse({
      ok: false,
      error: "Fallback origin is required when 'Use extracted item origins' is off.",
    });
    return;
  }

  let individualKg = 0;
  for (const it of items) {
    individualKg += emissionKgForShipment({
      fromLat: it.originLat,
      fromLng: it.originLng,
      toLat: destinationLat,
      toLng: destinationLng,
      weightKg: it.weightKg,
    });
  }

  const totalWeightKg = items.reduce((sum, it) => sum + it.weightKg, 0);
  let consolidatedKg = individualKg;
  let savingsKg = 0;
  let centroid = null;

  if (items.length >= 2) {
    centroid = weightedCentroid(items);
    if (centroid) {
      consolidatedKg = emissionKgForShipment({
        fromLat: centroid.lat,
        fromLng: centroid.lng,
        toLat: destinationLat,
        toLng: destinationLng,
        weightKg: totalWeightKg,
      });
      savingsKg = individualKg - consolidatedKg;
    }
  }

  const pct = individualKg > 0 ? (savingsKg / individualKg) * 100 : 0;
  const suggestion =
    savingsKg > 0
      ? `Consolidation could reduce estimated emissions by ~${savingsKg.toFixed(2)} kg CO2 (~${pct.toFixed(1)}%).`
      : `Consolidation didn’t reduce emissions with current origin data (or savings were negligible).`;

  const resultText = [
    `Detected item origins: ${items.length}`,
    `Total weight (kg): ${totalWeightKg.toFixed(2)}`,
    ``,
    `Individual estimate: ${individualKg.toFixed(2)} kg CO2`,
    `Consolidated estimate: ${consolidatedKg.toFixed(2)} kg CO2`,
    `Estimated savings: ${Math.max(0, savingsKg).toFixed(2)} kg CO2`,
    centroid ? `Centroid origin used: (${centroid.lat.toFixed(4)}, ${centroid.lng.toFixed(4)})` : ``,
    ``,
    suggestion,
  ]
    .filter(Boolean)
    .join("\n");

  sendResponse({
    ok: true,
    data: { resultText },
  });
});

