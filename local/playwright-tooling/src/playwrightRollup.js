import { existsSync } from 'node:fs';
import { exec, execSync } from 'child_process';
import { dirname, join } from 'node:path';
import { watch as rollupWatch } from 'rollup';
import { test } from '@playwright/test';
import { rollupPlaywrightConfig } from './rollup/rollupPlaywrightConfig.js';
import collectCoverage from './collectCoverage.js';

const getTestAppDir = (testDir) => {
  const appDir = join(testDir, 'app');
  const appExists = existsSync(appDir);

  if (!appExists) {
    return null;
  }

  return appDir;
};

const buildAppIfPresent = async (testDir, dev) => {
  const appDir = getTestAppDir(testDir);

  if (!appDir) {
    return;
  }

  console.log(`Building App: ${appDir}...`);
  const execOptions = {
    cwd: appDir,
  };
  execSync(`npm i`, execOptions);
  execSync(`npm run build`, execOptions);

  if (dev) {
    (async () => {
      return new Promise((resolve, reject) => {
        exec(`npm run dev`, execOptions, (error) => {
          if (error) {
            reject(error);
            return;
          }
        });
      });
    })();
  }
};

const createRollupBundle = async (testDir, useEsbuild, dev) => {
  await buildAppIfPresent(testDir, dev);

  const [config, getServer] = rollupPlaywrightConfig(testDir, useEsbuild, dev);
  const watcher = rollupWatch(config);

  const outputPath = await new Promise((resolve) => {
    let bundleOutput;
    if (dev) {
      console.log(`Using: ${useEsbuild ? 'esbuild' : 'rollup'}`);
    }
    watcher.on('event', (event) => {
      const { code, error, result, output } = event;
      if (code === 'ERROR') {
        console.log('Error:', error);
      }
      if (code === 'START') {
        if (dev) {
          console.log(`Building...`);
        }
      }
      if (code === 'BUNDLE_END') {
        bundleOutput = output[0];
        if (result) {
          result.close();
        }
      }
      if (code === 'END') {
        if (dev) {
          console.log(`Watching for changes...`);
          console.log('');
        } else {
          resolve(bundleOutput);
        }
      }
    });
  });

  const { address, port } = getServer().address();
  return {
    url: `http://${address}:${port}`,
    output: outputPath,
    close: () => {
      getServer().close();
      watcher.close();
    },
  };
};

export default (options) => {
  const { useEsbuild = true, adaptUrl = (originalUrl) => originalUrl } = options || {};
  let url;
  let close;

  const isDev = (config, timeout) =>
    config.globalTimeout === 0 && timeout === 0 && config.workers === 1;

  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, { file, config, timeout }) => {
    const testDir = dirname(file);
    const dev = isDev(config, timeout);

    if (dev) {
      test.setTimeout(0);
    }

    ({ close, url } = await createRollupBundle(testDir, useEsbuild, dev));
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(adaptUrl(url), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
  });

  test.afterEach(async ({ page, browserName }, { file, config, timeout }) => {
    if (browserName === 'chromium' && !isDev(config, timeout)) {
      const coverageJSON = await page
        .evaluate(() => JSON.stringify(window.__coverage__))
        .catch(() => null);
      await collectCoverage(process.cwd(), coverageJSON, file);
    }
  });

  test.afterAll(() => {
    close?.();
  });
};
