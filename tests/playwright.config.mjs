import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';

// Runs only against the repository's local static site, never production.
// No actual learner data, Cloudflare credentials, paid APIs or external services.
export default defineConfig({
 testDir:'./browser',
 timeout:25000,
 expect:{timeout:8000},
 workers:1,
 retries:0,
 reporter:'list',
 outputDir:'./browser-results',
 use:{
  baseURL:'http://127.0.0.1:8765',
  headless:true,
  trace:'off'
 },
 projects:[
  {name:'chromium',use:{browserName:'chromium'}},
  {name:'webkit',use:{browserName:'webkit'}}
 ],
 webServer:{
  cwd:fileURLToPath(new URL('../',import.meta.url)),
  command:'python3 -m http.server 8765 --bind 127.0.0.1',
  url:'http://127.0.0.1:8765/ai-studio.html',
  reuseExistingServer:false,
  timeout:20000
 }
});
