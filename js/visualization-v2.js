// balco.nyc — AI Solar Visualization v2
// Generates a clean architectural hero image of the building with panels

const SolarViz = {
  _cache: null,
  _pending: null,
  _pendingLat: null,
  _pendingLon: null,

  async start(lat, lon, floor, totalFloors) {
    // Return cached result if same location
    if (this._cache && this._cache.lat === lat && this._cache.lon === lon) {
      this._showResult(this._cache);
      return;
    }

    // Don't re-trigger if already fetching for this location
    if (this._pending && this._pendingLat === lat && this._pendingLon === lon) {
      return;
    }

    const container = document.getElementById('vizSection');
    const loading = document.getElementById('vizLoading');
    const imageWrap = document.getElementById('vizImageWrap');
    const error = document.getElementById('vizError');

    if (!container) return;

    container.style.display = 'block';
    loading.style.display = 'flex';
    if (imageWrap) imageWrap.style.display = 'none';
    error.style.display = 'none';

    this._pendingLat = lat;
    this._pendingLon = lon;

    try {
      this._pending = fetch('/api/visualize-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, floor, totalFloors }),
      });

      const res = await this._pending;
      const data = await res.json();
      this._pending = null;

      if (!res.ok || (!data.heroImage && !data.originalImage)) {
        throw new Error(data.error || 'Visualization failed');
      }

      this._cache = {
        lat, lon,
        heroImage: data.heroImage,
        originalImage: data.originalImage,
      };
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
    const imageWrap = document.getElementById('vizImageWrap');
    const error = document.getElementById('vizError');
    const container = document.getElementById('vizSection');
    const heroImg = document.getElementById('vizHeroImg');

    container.style.display = 'block';
    loading.style.display = 'none';

    const imgSrc = data.heroImage || data.originalImage;
    if (imgSrc) {
      heroImg.src = imgSrc;
      imageWrap.style.display = 'block';
      error.style.display = 'none';
    } else {
      error.style.display = 'block';
      error.textContent = 'Visualization unavailable for this address.';
    }
  },
};
