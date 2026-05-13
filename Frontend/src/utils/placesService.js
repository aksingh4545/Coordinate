const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export const placesService = {
  async findNearestLandmarks(location, radius = 1000) {
    if (!location || !location.lat || !location.lng) {
      console.warn('Invalid location for landmarks search');
      return [];
    }

    try {
      const response = await fetch(`${API_URL}/api/places/nearby?lat=${location.lat}&lng=${location.lng}&radius=${radius}&type=point_of_interest`);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results) {
        return data.results.slice(0, 5).map(place => ({
          name: place.name,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          rating: place.rating || 0,
          types: place.types || [],
          placeId: place.place_id,
        }));
      }
      return [];
    } catch (error) {
      console.error('Error finding landmarks:', error);
      return [];
    }
  },

  async findPlacesAlongRoute(origin, destination, radius = 1000) {
    if (!origin || !destination) return { currentPlaces: [], targetPlaces: [], routeData: null };

    try {
      const [routeResponse, currentResponse, targetResponse] = await Promise.all([
        fetch(`${API_URL}/api/places/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${destination.lat}&destLng=${destination.lng}`),
        fetch(`${API_URL}/api/places/nearby?lat=${origin.lat}&lng=${origin.lng}&radius=${radius}&type=point_of_interest`),
        fetch(`${API_URL}/api/places/nearby?lat=${destination.lat}&lng=${destination.lng}&radius=${radius}&type=point_of_interest`),
      ]);

      const routeData = routeResponse.ok ? await routeResponse.json() : null;
      const currentData = currentResponse.ok ? await currentResponse.json() : { status: 'ZERO_RESULTS' };
      const targetData = targetResponse.ok ? await targetResponse.json() : { status: 'ZERO_RESULTS' };

      const currentPlaces = currentData.status === 'OK' ? currentData.results.slice(0, 5).map(place => ({
        name: place.name,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        rating: place.rating || 0,
        types: place.types || [],
        placeId: place.place_id,
      })) : [];

      const targetPlaces = targetData.status === 'OK' ? targetData.results.slice(0, 5).map(place => ({
        name: place.name,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        rating: place.rating || 0,
        types: place.types || [],
        placeId: place.place_id,
      })) : [];

      return { currentPlaces, targetPlaces, routeData };
    } catch (error) {
      console.error('Error finding places along route:', error);
      return { currentPlaces: [], targetPlaces: [], routeData: null };
    }
  },

  async findExitsGates(location, radius = 2000) {
    if (!location || !location.lat || !location.lng) {
      console.warn('Invalid location for exits search');
      return [];
    }

    const types = ['transit_station', 'airport', 'subway_station', 'bus_station', 'train_station'];
    let allResults = [];
    const seen = new Set();

    try {
      const responses = await Promise.all(
        types.map(type => 
          fetch(`${API_URL}/api/places/nearby?lat=${location.lat}&lng=${location.lng}&radius=${radius}&type=${type}`)
            .then(res => res.ok ? res.json() : { results: [] })
            .catch(() => ({ results: [] }))
        )
      );

      for (const data of responses) {
        if (data.status === 'OK' && data.results) {
          for (const place of data.results) {
            if (!seen.has(place.place_id)) {
              seen.add(place.place_id);
              allResults.push(place);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error finding exits:', error);
    }

    return allResults
      .slice(0, 5)
      .map(place => ({
        name: place.name,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        types: place.types || [],
        placeId: place.place_id,
      }));
  },

  async findLeastCrowdedRoute(origin, destination) {
    if (!origin || !destination) return null;

    try {
      const response = await fetch(
        `${API_URL}/api/places/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${destination.lat}&destLng=${destination.lng}`
      );
      const data = await response.json();
      
      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const routes = data.routes.map(route => ({
          summary: route.summary,
          distance: route.legs[0].distance.value,
          duration: route.legs[0].duration_in_traffic?.value || route.legs[0].duration.value,
          polyline: route.overview_polyline.points,
          bounds: route.bounds,
        }));

        routes.sort((a, b) => a.duration - b.duration);
        return routes[0];
      }
      return null;
    } catch (error) {
      console.error('Error finding routes:', error);
      return null;
    }
  },

  async searchPlaces(query, location = null, radius = 2000) {
    if (!query) return [];

    try {
      let url = `${API_URL}/api/places/search?query=${encodeURIComponent(query)}`;
      
      if (location && location.lat && location.lng) {
        url += `&lat=${location.lat}&lng=${location.lng}&radius=${radius}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results) {
        return data.results.slice(0, 10).map(place => ({
          name: place.name,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          rating: place.rating || 0,
          address: place.formatted_address,
          types: place.types || [],
          placeId: place.place_id,
        }));
      }
      return [];
    } catch (error) {
      console.error('Error searching places:', error);
      return [];
    }
  },

  async getPlaceDetails(placeId) {
    if (!placeId) return null;

    try {
      const response = await fetch(`${API_URL}/api/places/details?placeId=${placeId}`);
      const data = await response.json();
      
      if (data.status === 'OK' && data.result) {
        return {
          name: data.result.name,
          address: data.result.formatted_address,
          rating: data.result.rating,
          openingHours: data.result.opening_hours,
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting place details:', error);
      return null;
    }
  }
};

export const calculateMeetingPoint = (locations) => {
  if (!locations || locations.length === 0) return null;
  
  const validLocations = locations.filter(loc => loc.lat && loc.lng && loc.lat !== 0 && loc.lng !== 0);
  if (validLocations.length === 0) return null;

  let minMaxDistance = Infinity;
  let meetingPoint = null;

  for (let i = 0; i < 20; i++) {
    let latSum = 0, lngSum = 0;
    validLocations.forEach(loc => {
      latSum += loc.lat;
      lngSum += loc.lng;
    });
    const candidateLat = latSum / validLocations.length;
    const candidateLng = lngSum / validLocations.length;

    let maxDistance = 0;
    validLocations.forEach(loc => {
      const distance = calculateHaversineDistance(
        candidateLat, candidateLng,
        loc.lat, loc.lng
      );
      maxDistance = Math.max(maxDistance, distance);
    });

    if (maxDistance < minMaxDistance) {
      minMaxDistance = maxDistance;
      meetingPoint = { lat: candidateLat, lng: candidateLng };
    }
  }

  return meetingPoint;
};

function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export default placesService;