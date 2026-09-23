const vibrator = {
  __calls: [],
  __failNext: false,
  vibrate: function (options) {
    vibrator.__calls.push(options.mode);
    if (vibrator.__failNext) {
      vibrator.__failNext = false;
      if (options.fail) {
        options.fail('mock failure', 1);
      }
      return;
    }
    if (options.success) {
      options.success();
    }
  },
  __reset: function () {
    vibrator.__calls = [];
    vibrator.__failNext = false;
  }
};

export default vibrator;
