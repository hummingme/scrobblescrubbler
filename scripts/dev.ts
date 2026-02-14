import { watch } from 'fs';
import { join } from 'path';

import { buildTarget } from './build.ts';

// --- CONFIG ---
const firefoxBin = '/opt/firefox-esr/firefox';
const firefoxProfile = 'web-ext-test';

const chromiumBin = '/usr/bin/google-chrome';
const chromiumProfile = 'webext';
const startUrl = 'https://www.last.fm/user/iriebob';

const target = getTarget();
const outDir = join('build', target);

function getTarget(): 'firefox' | 'chromium' {
    const target = process.argv[2] ?? 'firefox';
    if (target !== 'firefox' && target !== 'chromium') {
        console.error('Usage: bun dev.ts [firefox|chromium]');
        process.exit(1);
    }
    return target;
}

function startWatcher() {
    console.log('Watching for changes in src/ ...');
    let timer: NodeJS.Timeout | null = null;
    watch('src', { recursive: true }, async (_event, filename) => {
        if (!filename) return;
        if (filename.startsWith('.#')) return;
        if (!/\.(ts|css|json|html|svg|png)$/.test(filename)) return;
        console.log(`\nChange detected: ${filename}`);
        if (timer) clearTimeout(timer);

        timer = setTimeout(async () => {
            await buildTarget(target);
            timer = null;
        }, 500);
    });
}

function runWebExt(target: 'firefox' | 'chromium') {
    const cmd = [
        'web-ext',
        'run',
        '--keep-profile-changes',
        `--start-url=${startUrl}`,
        `--source-dir=${outDir}`,
        `--watch-file=${outDir}/background.js`,
    ].concat(
        target === 'firefox'
            ? [
                  `--firefox=${firefoxBin}`,
                  '--arg=--devtools',
                  `--firefox-profile=${firefoxProfile}`,
              ]
            : [
                  `--target=${target}`,
                  '--args="--auto-open-devtools-for-tabs"',
                  `--chromium-binary=${chromiumBin}`,
                  `--chromium-profile=${chromiumProfile}`,
              ],
    );
    const child = Bun.spawn({
        cmd,
        stdout: 'inherit',
        stderr: 'inherit',
    });

    process.on('SIGINT', () => {
        child.kill();
        process.exit(0);
    });
}

//--- MAIN ---
(async () => {
    await buildTarget(target);
    startWatcher();
    runWebExt(target);
})();
