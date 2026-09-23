/**
 * SensorProvider contract (implemented by HuaweiSensorProvider and MockSensorProvider):
 *
 *   start(onSample, onError)  begin delivering SensorSample objects to onSample(sample);
 *                             onError(SensorError) reports unavailable/failed sensors
 *   stop()                    stop delivery and release all platform subscriptions
 *   isRunning() -> boolean
 *   getCapabilities() -> SensorCapabilities (updated as sensors respond)
 *
 * The UI never talks to a provider directly — only WorkoutSessionController / calibration do.
 */
const REQUIRED_METHODS = ['start', 'stop', 'isRunning', 'getCapabilities'];

export function assertSensorProvider(provider) {
  for (let i = 0; i < REQUIRED_METHODS.length; i++) {
    if (!provider || typeof provider[REQUIRED_METHODS[i]] !== 'function') {
      throw new Error('SensorProvider is missing method: ' + REQUIRED_METHODS[i]);
    }
  }
  return provider;
}
