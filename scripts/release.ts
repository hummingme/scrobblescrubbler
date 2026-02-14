import { $ } from 'bun';
import { rmSync } from 'fs';
import { join } from 'path';

import { buildTarget } from './build.ts';

async function main() {
    const target = getTarget();

    const success = await buildTarget(target, 'production');
    if (!success) {
        process.exit(1);
    }

    const zipName = `${target}.zip`;
    rmSync(zipName, { force: true });

    const buildDir = join('build', target);
    await $`cd ${buildDir} && zip ../../${zipName} *.js manifest.json static/* static/icons/*`;

    console.log(`Created ${zipName}`);
}

function getTarget(): 'firefox' | 'chromium' {
    const target = process.argv[2] ?? 'firefox';
    if (target !== 'firefox' && target !== 'chromium') {
        console.error('Usage: bun release.ts [firefox|chromium]');
        process.exit(1);
    }
    return target;
}

main();
