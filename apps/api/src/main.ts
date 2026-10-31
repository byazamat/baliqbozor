import './instrument.js';

import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.API_PORT);
