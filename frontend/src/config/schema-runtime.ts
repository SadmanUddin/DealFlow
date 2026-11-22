import { config } from 'zod';

// Configure validation before application modules construct their schemas.
config({ jitless: true });
