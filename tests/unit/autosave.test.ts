import { describe, expect, test } from 'bun:test';
import { createEmptyProject, type Project } from '../../src/domain/model.ts';
import { createAutosaveScheduler } from '../../src/persistence/autosave.ts';

const project = createEmptyProject({ id: '123e4567-e89b-42d3-a456-426614174001' });

describe('debounced recovery autosave', () => {
	test('writes only the latest committed snapshot after the debounce window', async () => {
		const savedProjects: Project[] = [];
		const scheduler = createAutosaveScheduler({
			saveRecovery: async (savedProject) => {
				savedProjects.push(savedProject);

				return { ok: true, value: undefined };
			}
		}, { delayMs: 5 });
		const latest = { ...project, name: 'Latest project' };

		scheduler.schedule(project, new Map());
		scheduler.schedule(latest, new Map());
		await new Promise<void>((resolve) => setTimeout(resolve, 20));

		expect(savedProjects).toEqual([latest]);
		scheduler.cancel();
	});

	test('flushes immediately and surfaces repository failures', async () => {
		const scheduler = createAutosaveScheduler({
			saveRecovery: async () => ({
				ok: false,
				error: { code: 'quota-exceeded', message: 'quota reached' }
			})
		});

		scheduler.schedule(project, new Map());
		const result = await scheduler.flush();

		expect(result).toMatchObject({ ok: false, error: { code: 'quota-exceeded' } });
		expect(await scheduler.flush()).toEqual({ ok: true, value: undefined });
	});

	test('cancels a pending recovery write', async () => {
		const savedProjects: Project[] = [];
		const scheduler = createAutosaveScheduler({
			saveRecovery: async (savedProject) => {
				savedProjects.push(savedProject);

				return { ok: true, value: undefined };
			}
		}, { delayMs: 5 });

		scheduler.schedule(project, new Map());
		scheduler.cancel();
		await new Promise<void>((resolve) => setTimeout(resolve, 20));

		expect(savedProjects).toEqual([]);
	});
});
