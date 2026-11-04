import express from 'express';
import logger from '#config/logger.js'
const app = express();
// const PORT = process.env.PORT || 3000;

app.get('/',(req,res)=>{
  logger.info('Hello from DealFlow')
  res.status(200).send('Hello from DealFLow!');
});
export default app;