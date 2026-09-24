// @system.storage double: string key-value store.
let data = {};
let failures = 0;

function failed(options) {
  if (failures > 0) {
    failures--;
    options.fail('storage busy', 300);
    return true;
  }
  return false;
}

const storage = {
  get: function (options) {
    if (failed(options)) {
      return;
    }
    const has = Object.prototype.hasOwnProperty.call(data, options.key);
    options.success(has ? data[options.key] : options.default);
  },
  set: function (options) {
    if (failed(options)) {
      return;
    }
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
    failures = 0;
  },
  /** The next n get/set calls fail. */
  __failNext: function (n) {
    failures = n;
  }
};

export default storage;
