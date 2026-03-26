// balco.nyc — AI Solar Panel Visualization
// Fetches Street View + Gemini-edited image, displays before/after slider

const SolarViz = {
  _cache: null,      // { lat, lon, originalImage, editedImage }
  _pending: null,     // in-flight promise
  _sliderInit: false,

  // Start visualization — can be called early (on address select) or on calculate
  async start(lat, lon, floor, totalFloors) {
    // If we already have a result for this location, just show it
    if (this._cache && this._cache.lat === lat && this._cache.lon === lon) {
      this._showResult(this._cache);
      return;
    }

    // If already fetching for this location, don't re-trigger
    if (this._pending && this._pendingLat === lat && this._pendingLon === lon) {
      return;
    }

    const container = document.getElementById('vizSection');
    const loading = document.getElementById('vizLoading');
    const slider = document.getElementById('vizSlider');
    const error = document.getElementById('vizError');

    if (!container) return;

    // Show section with loading state
    container.style.display = 'block';
    loading.style.display = 'flex';
    slider.style.display = 'none';
    error.style.display = 'none';
    document.getElementById('vizLabels').style.display = 'none';
    this._sliderInit = false;

    this._pendingLat = lat;
    this._pendingLon = lon;

    try {
      const url = (typeof SolarConfig !== 'undefined' && SolarConfig.VISUALIZE_URL) || '/api/visualize';
      this._pending = fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, floor, totalFloors }),
      });

      const res = await this._pending;
      const data = await res.json();
      this._pending = null;

      if (!res.ok || (!data.originalImage && !data.editedImage)) {
        throw new Error(data.error || 'Visualization failed');
      }

      // Cache the result
      this._cache = { lat, lon, originalImage: data.originalImage, editedImage: data.editedImage };
      this._showResult(this._cache);

    } catch (err) {
      this._pending = null;
      console.warn('[SolarViz] Visualization failed:', err.message);
      loading.style.display = 'none';
      error.style.display = 'block';
      error.textContent = 'Visualization unavailable for this address.';
    }
  },

  _showResult(data) {
    const loading = document.getElementById('vizLoading');
    const slider = document.getElementById('vizSlider');
    const error = document.getElementById('vizError');
    const container = document.getElementById('vizSection');
    const beforeImg = document.getElementById('vizBefore');
    const afterImg = document.getElementById('vizAfter');

    container.style.display = 'block';
    loading.style.display = 'none';
    beforeImg.src = data.originalImage;

    if (data.editedImage) {
      afterImg.src = data.editedImage;
      slider.style.display = 'block';
      document.getElementById('vizLabels').style.display = 'flex';
      error.style.display = 'none';
      if (!this._sliderInit) { this.initSlider(); this._sliderInit = true; }
    } else {
      error.style.display = 'block';
      error.textContent = 'AI visualization unavailable — showing Street View of your building.';
      slider.style.display = 'block';
      afterImg.src = data.originalImage;
      document.getElementById('vizLabels').style.display = 'none';
      if (!this._sliderInit) { this.initSlider(); this._sliderInit = true; }
    }
  },

  // Initialize the before/after drag slider
  initSlider() {
    const container = document.getElementById('vizSlider');
    const handle = document.getElementById('vizHandle');
    const afterWrap = document.getElementById('vizAfterWrap');

    if (!container || !handle || !afterWrap) return;

    let isDragging = false;

    const updatePosition = (clientX) => {
      const rect = container.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(2, Math.min(98, pct));
      afterWrap.style.clipPath = `inset(0 0 0 ${pct}%)`;
      handle.style.left = `${pct}%`;
    };

    // Set initial position at 50%
    afterWrap.style.clipPath = 'inset(0 0 0 50%)';
    handle.style.left = '50%';

    // Mouse events
    handle.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (isDragging) updatePosition(e.clientX); });
    document.addEventListener('mouseup', () => { isDragging = false; });

    // Touch events
    handle.addEventListener('touchstart', (e) => { isDragging = true; e.preventDefault(); });
    document.addEventListener('touchmove', (e) => { if (isDragging) updatePosition(e.touches[0].clientX); });
    document.addEventListener('touchend', () => { isDragging = false; });

    // Click anywhere on slider to move handle
    container.addEventListener('click', (e) => {
      if (e.target !== handle) updatePosition(e.clientX);
    });
  },
};
