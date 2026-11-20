import app from './app.js';
import { getEnvironment } from '#config/env.js';

const { PORT } = getEnvironment();
app.listen(PORT, () => {
  console.log(`DealFlow API listening on port ${PORT}`);
});
