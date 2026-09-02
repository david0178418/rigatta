import { describe, expect, test } from 'bun:test';
import { createEmptyProject, type Project } from '../../src/domain/model.ts';
import type { PersistenceResult } from '../../src/persistence/repository.ts';
import { createAutosaveScheduler, type AutosaveStatus } from '../../src/persistence/autosave.ts';

const project = createEmptyProject({ id: '123e4567-e89b-42d3-a456-426614174080' });

describe('UX P1-24 autosave lifecycle', () => {
	test('reports scheduled, saving, and saved callbacks in order', async () => {
		const statuses: AutosaveStatus[] = [];
		const callbacks: string[] = [];
		const scheduler = createAutosaveScheduler({
			saveRecovery: async (): Promise<PersistenceResult<void>> => ({ ok: true, value: undefined })
		}, {
			delayMs: 5000,
			onStatus: (status) => statuses.push(status),
			onScheduled: () => callbacks.push('scheduled'),
			onSaving: () => callbacks.push('saving'),
			onSaved: () => callbacks.push('saved'),
			onError: () => callbacks.push('error')
		});

		scheduler.schedule(project, new Map());
		expect(statuses).toEqual(['scheduled']);
		expect(callbacks).toEqual(['scheduled']);

		await expect(scheduler.flush()).resolves.toEqual({ ok: true, value: undefined });
		expect(statuses).toEqual(['scheduled', 'saving', 'saved']);
		expect(callbacks).toEqual(['scheduled', 'saving', 'saved']);
		scheduler.cancel();
	});

	test('reports a failure and recovers to saved on the next snapshot', async () => {
		const failedProject = { ...project, name: 'failed snapshot' };
		const recoveredProject = { ...project, name: 'recovered snapshot' };
		const statuses: AutosaveStatus[] = [];
		const errors: string[] = [];
		const scheduler = createAutosaveScheduler({
			saveRecovery: async (candidate: Project): Promise<PersistenceResult<void>> => candidate === failedProject
				? { ok: false, error: { code: 'quota-exceeded', message: 'quota reached' } }
				: { ok: true, value: undefined }
		}, {
			delayMs: 5000,
			onStatus: (status) => statuses.push(status),
			onError: (error) => errors.push(`${error.code}:${error.message}`)
		});

		scheduler.schedule(failedProject, new Map());
		await expect(scheduler.flush()).resolves.toMatchObject({ ok: false, error: { code: 'quota-exceeded' } });
		expect(statuses).toEqual(['scheduled', 'saving', 'error']);
		expect(errors).toEqual(['quota-exceeded:quota reached']);

		scheduler.schedule(recoveredProject, new Map());
		await expect(scheduler.flush()).resolves.toEqual({ ok: true, value: undefined });
		expect(statuses).toEqual(['scheduled', 'saving', 'error', 'scheduled', 'saving', 'saved']);
		expect(errors).toEqual(['quota-exceeded:quota reached']);
		scheduler.cancel();
	});

	test('coalesces pending snapshots and cancels without lifecycle noise', async () => {
		const statuses: AutosaveStatus[] = [];
		const savedProjects: Project[] = [];
		const scheduler = createAutosaveScheduler({
			saveRecovery: async (candidate): Promise<PersistenceResult<void>> => {
				savedProjects.push(candidate);

				return { ok: true, value: undefined };
			}
		}, {
			delayMs: 5000,
			onStatus: (status) => statuses.push(status)
		});
		const latest = { ...project, name: 'latest snapshot' };

		scheduler.schedule(project, new Map());
		scheduler.schedule(latest, new Map());
		await expect(scheduler.flush()).resolves.toEqual({ ok: true, value: undefined });
		expect(savedProjects).toEqual([latest]);
		expect(statuses).toEqual(['scheduled', 'scheduled', 'saving', 'saved']);

		scheduler.schedule(project, new Map());
		scheduler.cancel();
		await expect(scheduler.flush()).resolves.toEqual({ ok: true, value: undefined });
		expect(statuses).toEqual(['scheduled', 'scheduled', 'saving', 'saved', 'scheduled']);
	});
});
