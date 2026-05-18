import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function uniqueParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const value = String(part || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatShortAddress(address = {}, displayName = '') {
  const primary = address.amenity ||
    address.shop ||
    address.tourism ||
    address.leisure ||
    address.office ||
    address.building ||
    address.road ||
    address.neighbourhood;
  const locality = address.suburb ||
    address.city_district ||
    address.neighbourhood ||
    address.city ||
    address.town ||
    address.village ||
    address.county;
  const region = address.state || address.country;
  const parts = uniqueParts([primary, locality, region]);

  if (parts.length > 0) {
    return parts.slice(0, 3).join(', ');
  }

  return displayName ? displayName.split(',').slice(0, 3).join(',').trim() : '';
}

router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 1000, type } = req.query;
  
  console.log(`[Places] /nearby request:`, { lat, lng, radius, type });
  
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Missing lat or lng' });
  }
  
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('[Places] GOOGLE_MAPS_API_KEY is not set');
    return res.status(500).json({ error: 'API key not configured' });
  }

  if (!process.env.NOMINATIM_EMAIL) {
    return res.status(400).json({ error: 'NOMINATIM_EMAIL is not configured' });
  }

  try {
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${GOOGLE_MAPS_API_KEY}`;
    
    if (type) {
      url += `&type=${type}`;
    }
    
    console.log(`[Places] Calling Google API with type: ${type}`);

    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    
    if (!response.ok) {
      console.error(`[Places] Google API error: ${response.status}`);
      return res.status(response.status).json({ error: `Google API error: ${response.status}` });
    }
    
    const data = await response.json();
    
    console.log(`[Places] Google API response status: ${data.status}, results: ${data.results?.length || 0}`);
    
    res.json(data);
  } catch (error) {
    console.error('[Places] Error fetching places:', error);
    res.status(500).json({ error: 'Failed to fetch places data' });
  }
});

router.get('/search', async (req, res) => {
  const { query, lat, lng, radius = 2000 } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Missing query' });
  }

  try {
    const searchParams = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: '10',
    });

    if (process.env.NOMINATIM_EMAIL) {
      searchParams.set('email', process.env.NOMINATIM_EMAIL);
    }

    const url = `https://nominatim.openstreetmap.org/search?${searchParams.toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': `Coordinator/1.0 (contact: ${process.env.NOMINATIM_EMAIL})`,
        'Accept-Language': 'en',
      }
    });

    if (!response.ok) {
      console.error('Nominatim error:', response.status);
      return res.status(response.status).json({ error: 'Nominatim search failed' });
    }

    const data = await response.json();
    const results = (data || []).map((item) => ({
      name: item.display_name?.split(',')[0] || item.display_name || 'Unknown',
      formatted_address: item.display_name || '',
      geometry: {
        location: {
          lat: Number(item.lat),
          lng: Number(item.lon),
        },
      },
      place_id: item.place_id,
      types: item.type ? [item.type] : [],
    }));

    res.json({ status: 'OK', results });
  } catch (error) {
    console.error('Nominatim search error:', error);
    res.status(500).json({ error: 'Failed to search places' });
  }
});

router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Missing or invalid coordinates' });
  }

  try {
    const reverseParams = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
    });

    if (process.env.NOMINATIM_EMAIL) {
      reverseParams.set('email', process.env.NOMINATIM_EMAIL);
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${reverseParams.toString()}`,
      {
        headers: {
          'User-Agent': `Coordinator/1.0${process.env.NOMINATIM_EMAIL ? ` (${process.env.NOMINATIM_EMAIL})` : ''}`,
          'Accept-Language': 'en',
        },
      }
    );

    if (!response.ok) {
      console.error('Nominatim reverse error:', response.status);
      return res.status(response.status).json({ error: 'Nominatim reverse lookup failed' });
    }

    const data = await response.json();
    const displayName = data.display_name || '';

    res.json({
      status: displayName ? 'OK' : 'ZERO_RESULTS',
      result: {
        name: data.name || data.address?.amenity || data.address?.road || '',
        address: displayName,
        shortAddress: formatShortAddress(data.address, displayName),
      },
    });
  } catch (error) {
    console.error('Nominatim reverse lookup error:', error);
    res.status(500).json({ error: 'Failed to reverse geocode location' });
  }
});

router.get('/directions', async (req, res) => {
  const { originLat, originLng, destLat, destLng } = req.query;
  
  if (!originLat || !originLng || !destLat || !destLng) {
    return res.status(400).json({ error: 'Missing coordinates' });
  }

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=polyline`;
    const response = await fetch(osrmUrl);
    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes?.[0]) {
      return res.json({
        routes: [{
          overview_polyline: {
            points: data.routes[0].geometry
          },
          legs: data.routes[0].legs
        }],
        status: 'OK'
      });
    }
    res.status(500).json({ error: 'OSRM routing failed' });
  } catch (error) {
    console.error('OSRM Directions error:', error);
    res.status(500).json({ error: 'Failed to fetch directions' });
  }
});

router.get('/details', async (req, res) => {
  const { placeId } = req.query;
  
  if (!placeId || !GOOGLE_MAPS_API_KEY) {
    return res.status(400).json({ error: 'Missing placeId or API key' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    console.error('Google Place Details API error:', error);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

export default router;
