import { $, build } from 'bun';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';

const entrypoints = ['src/background.ts', 'src/scrobble-scrubbler.ts', 'src/popup.ts'];
const staticAssets = ['src/static'];

export async function buildTarget(
    target: 'firefox' | 'chromium',
    mode: 'development' | 'production' = 'development',
): Promise<boolean> {
    const outDir = `build/${target}`;
    const manifest = `src/manifest-${target}.json`;
    try {
        const conditions =
            mode === 'production'
                ? ['production', target, 'browser']
                : ['development', target, 'browser'];
        const sourcemap = mode === 'production' ? undefined : 'external';
        const result = await build({
            entrypoints,
            outdir: outDir,
            conditions,
            sourcemap,
            define: {
                'process.env.NODE_ENV': JSON.stringify('production'),
            },
        });
        if (!result.success) {
            console.error('Build failed:', result.logs);
            return false;
        }
    } catch (err) {
        console.error(`[${target}] Fatal build error:`, err);
        return false;
    }

    fixSourceMap(outDir, entrypoints, mode);

    await $`cp ${manifest} ${outDir}/manifest.json`;

    for (const asset of staticAssets) {
        await $`cp -r ${asset} ${outDir}/`;
    }

    console.log(`[${target}] Build complete`);
    return true;
}

function fixSourceMap(
    outDir: string,
    entrypoints: string[],
    mode: 'development' | 'production',
) {
    if (mode === 'production') return;
    for (const entry of entrypoints) {
        const base = basename(entry, extname(entry));
        const jsPath = join(outDir, `${base}.js`);
        const mapPath = `${base}.js.map`;
        if (!existsSync(jsPath)) continue;

        const code = readFileSync(jsPath, 'utf8');
        if (!code.includes('sourceMappingURL')) {
            writeFileSync(jsPath, code + `\n//# sourceMappingURL=${mapPath}\n`);
        }
    }
}

if (import.meta.main) {
    const arg = process.argv[2] ?? 'firefox';
    if (arg !== 'firefox' && arg !== 'chromium') {
        console.error('Usage: bun scripts/build.ts [firefox|chromium]');
        process.exit(1);
    }

    const success = await buildTarget(arg);
    process.exit(success ? 0 : 1);
}
