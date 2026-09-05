import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dir, '..');
const distRoot = resolve(projectRoot, 'dist');

function normalizeBasePath(value: string): string {
	const path = value.trim();
	if (path === '' || path === '/') return '/';
	return `/${path.replace(/^\/+|\/+$/g, '')}/`;
}

async function build(): Promise<void> {
	await rm(distRoot, { recursive: true, force: true });
	await mkdir(distRoot, { recursive: true });

	const result = await Bun.build({
		entrypoints: [resolve(projectRoot, 'index.html')],
		outdir: distRoot,
		minify: true,
		publicPath: normalizeBasePath(Bun.env.BASE_PATH ?? '/')
	});

	if (result.success) return;
	throw new Error(result.logs.map(String).join('\n') || 'Browser bundle failed');
}

await build();
