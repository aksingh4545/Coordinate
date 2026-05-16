export class SimpleKalmanFilter {
  constructor(processNoise = 0.00001, measurementNoise = 0.0001) {
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.estimatedError = 1;
    this.lastEstimate = null;
  }

  filter(value) {
    if (this.lastEstimate === null) {
      this.lastEstimate = value;
      return value;
    }

    const predictionError = this.estimatedError + this.processNoise;
    const gain = predictionError / (predictionError + this.measurementNoise);
    const currentEstimate = this.lastEstimate + gain * (value - this.lastEstimate);
    this.estimatedError = (1 - gain) * predictionError;

    this.lastEstimate = currentEstimate;
    return currentEstimate;
  }

  reset() {
    this.lastEstimate = null;
    this.estimatedError = 1;
  }
}

export class LocationSmoother {
  constructor(options = {}) {
    this.processNoise = options.processNoise || 0.00001;
    this.measurementNoise = options.measurementNoise || 0.0001;
    this.enableHighAccuracy = options.enableHighAccuracy !== false;
    this.positionHistory = [];
    this.maxHistorySize = options.maxHistorySize || 10;
    this.minAccuracy = options.minAccuracy || 50;
    this.lastSmoothed = null;
    
    this.kalmanLat = new SimpleKalmanFilter(this.processNoise, this.measurementNoise);
    this.kalmanLng = new SimpleKalmanFilter(this.processNoise, this.measurementNoise);
  }

  filter(lat, lng, accuracy = null, speed = null) {
    if (accuracy && accuracy > this.minAccuracy) {
      console.log(`⚠️ Low accuracy (${accuracy}m), using previous estimate`);
      return this.lastSmoothed || this.getWeightedAverage() || { lat, lng };
    }

    if (speed !== null && speed > 50) {
      console.log(`⚠️ Suspicious speed (${speed}m/s), ignoring`);
      return this.lastSmoothed || this.getWeightedAverage() || { lat, lng };
    }

    const measurementNoise = this.calculateMeasurementNoise(accuracy);
    this.kalmanLat.measurementNoise = measurementNoise;
    this.kalmanLng.measurementNoise = measurementNoise;

    const smoothedLat = this.kalmanLat.filter(lat);
    const smoothedLng = this.kalmanLng.filter(lng);

    this.positionHistory.push({ lat: smoothedLat, lng: smoothedLng, timestamp: Date.now() });
    if (this.positionHistory.length > this.maxHistorySize) {
      this.positionHistory.shift();
    }

    this.lastSmoothed = { lat: smoothedLat, lng: smoothedLng };
    return this.lastSmoothed;
  }

  calculateMeasurementNoise(accuracy) {
    if (!accuracy) return 0.0001;
    if (accuracy < 5) return 0.00001;
    if (accuracy < 10) return 0.00005;
    if (accuracy < 20) return 0.0001;
    if (accuracy < 50) return 0.0005;
    return 0.001;
  }

  getWeightedAverage() {
    if (this.positionHistory.length === 0) return null;
    
    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLng = 0;

    this.positionHistory.forEach((pos, index) => {
      const weight = index + 1;
      totalWeight += weight;
      weightedLat += pos.lat * weight;
      weightedLng += pos.lng * weight;
    });

    return {
      lat: weightedLat / totalWeight,
      lng: weightedLng / totalWeight
    };
  }

  reset() {
    this.kalmanLat.reset();
    this.kalmanLng.reset();
    this.positionHistory = [];
  }
}

export function calculateAccuracy(speed, accuracy) {
  if (accuracy > 100) return 0.0005;
  if (accuracy > 50) return 0.0002;
  if (accuracy > 20) return 0.0001;
  return 0.00005;
}

export class GpsAccuracyManager {
  constructor() {
    this.accuracyHistory = [];
    this.maxHistory = 20;
  }

  addReading(accuracy) {
    this.accuracyHistory.push({ accuracy, timestamp: Date.now() });
    if (this.accuracyHistory.length > this.maxHistory) {
      this.accuracyHistory.shift();
    }
  }

  getBestAccuracy() {
    if (this.accuracyHistory.length === 0) return null;
    return Math.min(...this.accuracyHistory.map(r => r.accuracy));
  }

  getAverageAccuracy() {
    if (this.accuracyHistory.length === 0) return null;
    const sum = this.accuracyHistory.reduce((acc, r) => acc + r.accuracy, 0);
    return sum / this.accuracyHistory.length;
  }

  isReliable() {
    const avg = this.getAverageAccuracy();
    return avg !== null && avg < 30;
  }
}