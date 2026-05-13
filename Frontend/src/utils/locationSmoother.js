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
    this.maxHistorySize = options.maxHistorySize || 5;
    
    this.kalmanLat = new SimpleKalmanFilter(this.processNoise, this.measurementNoise);
    this.kalmanLng = new SimpleKalmanFilter(this.processNoise, this.measurementNoise);
  }

  filter(lat, lng) {
    const smoothedLat = this.kalmanLat.filter(lat);
    const smoothedLng = this.kalmanLng.filter(lng);
    return { lat: smoothedLat, lng: smoothedLng };
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