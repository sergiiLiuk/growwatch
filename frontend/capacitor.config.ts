import type { CapacitorConfig } from '@capacitor/cli';

// Same Angular production build is consumed by both the web (PWA) and the
// native iOS / Android shells. webDir points at the Angular build output.
const config: CapacitorConfig = {
  appId: 'com.growwatch.app',
  appName: 'GrowWatch',
  webDir: 'dist/smart-green-house/browser',
  server: {
    androidScheme: 'https',
  },
};

export default config;
