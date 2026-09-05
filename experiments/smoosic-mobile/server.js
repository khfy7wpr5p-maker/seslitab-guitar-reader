const express = require('express');
const path = require('path');

const app = express();
const publicDir = path.join(__dirname, 'public');
const port = process.env.PORT || 10000;

app.use(express.static(publicDir));
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.listen(port, '0.0.0.0', () => {
  console.log(`Smoosic mobile POC listening on ${port}`);
});
