import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/node';
import { getEnvironment } from '#config/env.js';
// import { isSpoofedBot } from "@arcjet/inspect";
// import express from "express";

// const app = express();
// const port = 3000;

const aj = arcjet({
  key: getEnvironment().ARCJET_KEY,
  rules: [
    shield({
      mode: 'LIVE',
    }),
    // Create a bot detection rule
    detectBot({
      mode: 'LIVE',
      allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
    }),
    slidingWindow({
      mode: 'LIVE',
      interval: '2s',
      max: 5,
    }),
  ],
});

export default aj;
