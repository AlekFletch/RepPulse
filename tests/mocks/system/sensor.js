// Jest double for @system.sensor. Tests drive callbacks through the __ helpers.
const subs = {};

function subscribe(name) {
  return function (options) {
    if (sensor.__throwOn[name]) {
      throw new Error('mock: ' + name + ' throws');
    }
    subs[name] = options;
    sensor.__calls.push('subscribe' + name);
  };
}

function unsubscribe(name) {
  return function () {
    delete subs[name];
    sensor.__calls.push('unsubscribe' + name);
  };
}

const sensor = {
  subscribeAccelerometer: subscribe('Accelerometer'),
  unsubscribeAccelerometer: unsubscribe('Accelerometer'),
  subscribeGyroscope: subscribe('Gyroscope'),
  unsubscribeGyroscope: unsubscribe('Gyroscope'),
  subscribeDeviceOrientation: subscribe('DeviceOrientation'),
  unsubscribeDeviceOrientation: unsubscribe('DeviceOrientation'),
  subscribeHeartRate: subscribe('HeartRate'),
  unsubscribeHeartRate: unsubscribe('HeartRate'),

  __calls: [],
  __throwOn: {},
  __subscription: function (name) {
    return subs[name] || null;
  },
  __emit: function (name, data) {
    if (subs[name]) {
      subs[name].success(data);
    }
  },
  __fail: function (name, message, code) {
    if (subs[name] && subs[name].fail) {
      subs[name].fail(message, code);
    }
  },
  __reset: function () {
    for (const key of Object.keys(subs)) {
      delete subs[key];
    }
    sensor.__calls = [];
    sensor.__throwOn = {};
  }
};

export default sensor;
