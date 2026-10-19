import { defineConfig } from 'vite';

// main.js only asks for the world data and globe textures after every module has loaded and
// evaluated. Preloading them from the HTML overlaps those downloads with the JS instead.
// crossorigin="anonymous" matches how fetch() and THREE.TextureLoader request them, so the
// browser reuses the preloaded responses rather than downloading twice.
const PRELOAD = [
  ['/data/countries-50m.json', 'fetch', 'high'],
  ['/data/watchtower.json', 'fetch', 'high'],
  ['/textures/earth-blue-marble.jpg', 'image', 'auto'],
  ['/textures/earth-topology.png', 'image', 'auto'],
  ['/textures/earth-water.png', 'image', 'auto'],
  ['/textures/earth-night.jpg', 'image', 'auto'],
  ['/textures/night-sky.png', 'image', 'low'],
];

const preloadWorld = () => ({
  name: 'underlord-preload-world',
  transformIndexHtml(html) {
    return PRELOAD.filter(([href]) => !html.includes(`href="${href}"`)).map(([href, as, fetchpriority]) => ({
      tag: 'link',
      attrs: { rel: 'preload', href, as, crossorigin: 'anonymous', fetchpriority },
      injectTo: 'head',
    }));
  },
});

export default defineConfig({
  plugins: [preloadWorld()],
  build: {
    target: 'es2022', // main.js uses top-level await
    chunkSizeWarningLimit: 1500,
    reportCompressedSize: false,
    rollupOptions: {
      // three.js changes far less often than the game code, so it gets its own long-cached chunk.
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { port: 5199 },
});
