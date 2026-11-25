import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  outputDir: '../../test-results',
  use: {
    baseURL: 'http://localhost:4173',
    // iPhone 16 portrait profile (393x852 @ 3x, mobile touch)
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    browserName: 'chromium',
    channel: 'chromium',
    headless: true,
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--enable-features=Vulkan',
        '--use-vulkan=swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
