import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';

// Github hosted Ubuntu system Chrome, isolated localhost-only test.
export default defineConfig({
 testDir:'./browser',
 testMatch:'step-hajj.spec.mjs',
 timeout:25000,
 expect:{timeout:8000},
 reporter:'list',
 workers:1,
 retries:0,
 use:{baseURL:'http://127.0.0.1:8767',headless:true,browserName:'chromium',channel:'chrome',trace:'off'},
 projects:[{name:'system-chrome',use:{browserName:'chromium',channel:'chrome'}}],
 webServer:{
  cwd:fileURLToPath(new URL('../',import.meta.url)),
  command:'python3 -m http.server 8767 --bind 127.0.0.1',
  url:'http://127.0.0.1:8767/academy.html',
  reuseExistingServer:false,
  timeout:20000
 }
});
