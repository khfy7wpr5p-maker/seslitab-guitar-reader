const path = require('path');

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'src/index.js'),
  output: {
    path: path.resolve(__dirname, 'public/build'),
    filename: 'mobile.js',
    clean: true
  },
  devtool: false,
  resolve: {
    extensions: ['.js', '.json']
  },
  performance: {
    hints: false
  }
};
