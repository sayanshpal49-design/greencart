# GreenCart — E‑Commerce Cart Carbon Footprint Optimizer

Chrome extension (Manifest V3) that estimates cart CO2 emissions using the **Haversine formula** and suggests shipment consolidation.

## How it works (interview-friendly)
1. The extension reads cart item “origin” coordinates from the DOM.
2. It computes distance (km) using Haversine between each item origin and your destination.
3. It estimates CO2 as: `weight(tons) * distance(km) * factor`.
4. If multiple origins are detected, it also computes a “consolidated” estimate using the weighted centroid of origins.

## Setup
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `greencart-extension/`

## Important note about Amazon DOM
Amazon pages don’t expose reliable lat/lng for each product by default. This project therefore looks for coordinates in dataset attributes like:
- `data-origin-lat`, `data-origin-lng` (recommended)
- (fallback) `data-item-lat`, `data-item-lng`

To demo on your own pages (or a test page), add these attributes to item elements, or adjust the selectors in `content.js`.

