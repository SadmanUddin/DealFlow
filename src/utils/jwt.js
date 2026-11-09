import jwt, { verify } from 'jsonwebtoken';
import { token } from 'morgan';
import { error } from 'winston';
import logger from '#config/logger.js';
const JWT_SECRET = process.env.JWT_SECRET || 'Your-Key-please-change-in-production';
const JWT_EXPIRES_IN = '1d';
export const jwttoken={
  sign:(payload)=>{
    try{
      return jwt.sign(payload,JWT_SECRET,{expiresIn:JWT_EXPIRES_IN});
    }catch(e){
      logger.error('Failed to authenticate token',e);
      throw new Error('Failed to authenticate token');
    }
  },
  verify:(token)=>{
    try{
      return jwt.verify(token,JWT_SECRET);
    } catch(e){
      logger.error('Failed to authenticate token',e);
      throw new Error('Failed to authenticate token');
    }
  }
};
