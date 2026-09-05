const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    'smoosic-engine': 'smoosic',
    mobile: {
      import: path.resolve(__dirname, 'src/index.js'),
      dependOn: 'smoosic-engine'
    },
    'corpus-stress': path.resolve(__dirname, 'src/corpus-stress.js')
  },
  output: {
    path: path.resolve(__dirname, 'public/build'),
    filename: '[name].js',
    chunkFilename: '[name].[contenthash:8].js',
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
