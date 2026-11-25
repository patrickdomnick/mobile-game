import { spawn } from 'node:child_process';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Automatically recompiles TinyGo WASM (sim/*.go -> public/game.wasm) and
 * triggers a live browser hot-reload whenever simulation Go sources change during `pnpm dev`.
 */
function watchSimWasmPlugin(): Plugin {
  return {
    name: 'watch-sim-wasm',
    configureServer(server) {
      const simDir = path.resolve(process.cwd(), 'sim');
      server.watcher.add(simDir);

      let timer: NodeJS.Timeout | null = null;
      let building = false;
      let pending = false;

      const runWasmBuild = () => {
        if (building) {
          pending = true;
          return;
        }
        building = true;
        pending = false;

        const home = process.env.HOME ?? '';
        const extraPath = `${home}/.local/toolchains/go/bin:${home}/.local/toolchains/tinygo/bin`;
        const child = spawn('bash', ['scripts/build-wasm.sh'], {
          cwd: process.cwd(),
          env: { ...process.env, PATH: `${extraPath}:${process.env.PATH ?? ''}` },
          stdio: 'inherit',
        });

        child.on('close', (code) => {
          building = false;
          if (code === 0) {
            server.ws.send({ type: 'full-reload' });
          } else {
            console.error(`[watch-sim-wasm] TinyGo WASM rebuild failed (exit ${code})`);
          }
          if (pending) runWasmBuild();
        });
      };

      server.watcher.on('change', (file) => {
        if (file.startsWith(simDir) && file.endsWith('.go') && !file.endsWith('_test.go')) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(runWasmBuild, 150);
        }
      });
    },
  };
}

export default defineConfig({
  // Relative base so the same dist/ works at both http://localhost:4173/ and GitHub Pages (/mobile-game/)
  base: './',
  plugins: [watchSimWasmPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
