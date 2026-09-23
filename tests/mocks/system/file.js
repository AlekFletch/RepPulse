// @system.file double. readText honours position/length like the platform API.
let files = {};
let dirs = {};

function notFound(options) {
  options.fail('file not found', 301);
}

const file = {
  writeText: function (options) {
    files[options.uri] = options.append && files[options.uri] ? files[options.uri] + options.text : options.text;
    options.success();
  },
  readText: function (options) {
    if (!Object.prototype.hasOwnProperty.call(files, options.uri)) {
      notFound(options);
      return;
    }
    file.__reads++;
    const text = files[options.uri];
    const position = options.position || 0;
    const length = typeof options.length === 'number' ? options.length : 4096;
    options.success({ text: text.substr(position, length) });
  },
  delete: function (options) {
    if (!Object.prototype.hasOwnProperty.call(files, options.uri)) {
      notFound(options);
      return;
    }
    delete files[options.uri];
    options.success();
  },
  list: function (options) {
    const prefix = options.uri.endsWith('/') ? options.uri : options.uri + '/';
    if (!dirs[options.uri] && !Object.keys(files).some((u) => u.startsWith(prefix))) {
      notFound(options);
      return;
    }
    const fileList = Object.keys(files)
      .filter((u) => u.startsWith(prefix) && u.slice(prefix.length).indexOf('/') === -1)
      .map((u) => ({ uri: u, type: 'file', length: files[u].length, lastModifiedTime: 0 }));
    options.success({ fileList: fileList });
  },
  access: function (options) {
    if (dirs[options.uri] || Object.prototype.hasOwnProperty.call(files, options.uri)) {
      options.success();
    } else {
      notFound(options);
    }
  },
  mkdir: function (options) {
    dirs[options.uri] = true;
    options.success();
  },
  __reads: 0,
  __files: function () {
    return files;
  },
  __reset: function () {
    files = {};
    dirs = {};
    file.__reads = 0;
  }
};

export default file;
