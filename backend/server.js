import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import apiRouter from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.use('/api', apiRouter);

const frontendDir = path.join(__dirname, '..', 'frontend');
const publicDir = path.join(frontendDir, 'public');
const srcDir = path.join(frontendDir, 'src');
const waiterDir = path.join(frontendDir, 'waiter');
const reportsDir = path.join(__dirname, '..', 'reports');

app.use('/frontend/src', express.static(srcDir));
app.use('/waiter', express.static(waiterDir));
app.use('/reports', express.static(reportsDir));
app.use(express.static(publicDir));
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n' + '='.repeat(50));
  console.log('Food Court Server Running!');
  console.log('='.repeat(50));
  console.log(`Local:    http://localhost:${PORT}`);
  console.log(`Network:  http://${localIP}:${PORT}`);
  console.log('\nAccess from other devices on the same network:');
  console.log(`  - Ops Console:  http://${localIP}:${PORT}`);
  console.log(`  - Waiter App:   http://${localIP}:${PORT}/waiter`);
  console.log('='.repeat(50) + '\n');
});

