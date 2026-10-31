import 'reflect-metadata';
import './config/load-env-file.js';

import { createWorker } from './bootstrap.js';
import { loadEnv } from './config/env.js';

await createWorker(loadEnv());
