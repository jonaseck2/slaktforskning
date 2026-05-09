import { execFileSync } from 'node:child_process';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('./package.json') as { version: string };
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'slaktforskning',
    extraResource: ['./dist-static', './THIRD_PARTY_LICENSES.txt'],
    // Aggressive allowlist. The runtime only needs:
    //   - /.vite (everything Vite emits: main bundle, worker, preload, renderer,
    //     WASM copy, gazetteer assets)
    //   - /package.json (Electron reads `main` from here at startup)
    // Everything else (src/, node_modules/, docs, tests, dev configs, .claude,
    // .superpowers, top-level Markdown, etc.) is dev-only because Vite bundles
    // every JS dep that isn't in `external` (currently just electron + node
    // builtins) into the .vite output. dist-static and THIRD_PARTY_LICENSES.txt
    // ship via extraResource above, outside the asar entirely.
    ignore: (filePath: string): boolean => {
      if (filePath === '') return false; // packager calls with '' for the root; never ignore that
      if (filePath === '/package.json') return false;
      if (filePath === '/.vite' || filePath.startsWith('/.vite/')) return false;
      return true;
    },
  },
  hooks: {
    generateAssets: async () => {
      execFileSync('node', ['scripts/build-third-party-licenses.mjs'], { stdio: 'inherit' });
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupExe: `Slaktforskning-${version}.exe` }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/main/db-worker.ts',
          config: 'vite.worker.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
