import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';

// Scoped WCAG checks on GitHub-hosted ubuntu-24.04's pre-installed Chrome.
// No browser binary/OS package downloads; localhost-only synthetic pages.
export default defineConfig({
 testDir:'./browser',
 testMatch:'core-learning.spec.mjs',
 grep:/automated WCAG A\/AA audit/,
 timeout:25000,
 expect:{timeout:8000},
 retries:0,
 workers:1,
 reporter:'list',
 outputDir:'./browser-a11y-results',
 use:{
  baseURL:'http://127.0.0.1:8765',
  browserName:'chromium',
  channel:'chrome',
  headless:true,
  trace:'off'
 },
 projects:[
  {name:'system-chrome',use:{browserName:'chromium',channel:'chrome'}}
 ],
 webServer:{
  cwd:fileURLToPath(new URL('../',import.meta.url)),
  command:'python3 -m http.server 8765 --bind 127.0.0.1',
  url:'http://127.0.0.1:8765/index.html',
  reuseExistingServer:false,
  timeout:20000
 }
});
