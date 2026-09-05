const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    mobile: [
      path.resolve(__dirname, 'src/mobile-layout.js'),
      path.resolve(__dirname, 'src/index.js')
    ],
    'corpus-stress': path.resolve(__dirname, 'src/corpus-stress.js')
  },
  output: {
    path: path.resolve(__dirname, 'public/build'),
    filename: '[name].js',
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
