// Used only by Jest to run the ES-module sources under Node.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
};
