// @system.storage double: string key-value store.
let data = {};

const storage = {
  get: function (options) {
    const has = Object.prototype.hasOwnProperty.call(data, options.key);
    options.success(has ? data[options.key] : options.default);
  },
  set: function (options) {
    data[options.key] = options.value;
    options.success();
  },
  delete: function (options) {
    delete data[options.key];
    options.success();
  },
  clear: function (options) {
    data = {};
    if (options && options.success) {
      options.success();
    }
  },
  __reset: function () {
    data = {};
  }
};

export default storage;
