const battery = {
  __status: { level: 0.8, charging: false },
  __fail: false,
  getStatus: function (options) {
    if (battery.__fail) {
      options.fail('mock failure', 200);
      return;
    }
    options.success({ level: battery.__status.level, charging: battery.__status.charging });
  },
  __reset: function () {
    battery.__status = { level: 0.8, charging: false };
    battery.__fail = false;
  }
};

export default battery;
