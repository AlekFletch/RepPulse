const brightness = {
  __keepScreenOn: null,
  setKeepScreenOn: function (options) {
    brightness.__keepScreenOn = options.keepScreenOn;
    if (options.success) {
      options.success();
    }
  },
  __reset: function () {
    brightness.__keepScreenOn = null;
  }
};

export default brightness;
