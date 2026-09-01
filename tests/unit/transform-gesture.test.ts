import { describe, expect, test } from 'bun:test';
import { createTransformGesture, isTransformHandleHit, transformGestureCommand, transformGestureCommands } from '../../src/app/transform-gesture.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

describe('setup transform gestures', () => {
	test('creates a translated bone command from logical pointer movement', () => {
		const project = createRigProject();
		const gesture = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'translate');

		if (!gesture) {
			throw new Error('Root transform gesture was not created.');
		}

		const command = transformGestureCommand(gesture, { x: 120, y: 65 });

		expect(command).toMatchObject({
			kind: 'update-bone-transform',
			boneId: fixtureIds.root,
			transform: { x: 120, y: 65 }
		});
	});

	test('supports rotation and nonuniform scale deltas', () => {
		const project = createRigProject();
		const rotation = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 120, y: 50 }, 'rotate');
		const scale = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'scale');

		if (!rotation || !scale) {
			throw new Error('Root transform gestures were not created.');
		}

		expect(transformGestureCommand(rotation, { x: 100, y: 70 })).toMatchObject({ transform: { rotation: 1.5707963267948966 } });
		expect(transformGestureCommand(scale, { x: 150, y: 25 })).toMatchObject({ transform: { scaleX: 1.5, scaleY: 0.75 } });
	});

	test('supports shear deltas and tool handle hit regions', () => {
		const project = createRigProject();
		const shear = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'shear');

		if (!shear) {
			throw new Error('Root shear gesture was not created.');
		}

		expect(transformGestureCommand(shear, { x: 150, y: 25 })).toMatchObject({ transform: { shearX: 0.5, shearY: -0.25 } });
		expect(isTransformHandleHit(project, { kind: 'bone', id: fixtureIds.root }, { x: 130, y: 50 }, 'rotate')).toBe(true);
		expect(isTransformHandleHit(project, { kind: 'bone', id: fixtureIds.root }, { x: 138, y: 50 }, 'scale')).toBe(true);
		expect(isTransformHandleHit(project, { kind: 'bone', id: fixtureIds.root }, { x: 122, y: 50 }, 'shear')).toBe(true);
		expect(isTransformHandleHit(project, { kind: 'bone', id: fixtureIds.root }, { x: 300, y: 300 }, 'rotate')).toBe(false);
	});

	test('creates one transform command per selected transformable entity', () => {
		const project = createRigProject();
		const gesture = createTransformGesture(project, [
			{ kind: 'attachment', id: fixtureIds.image },
			{ kind: 'attachment', id: fixtureIds.point }
		], { x: 200, y: 200 }, 'translate');

		if (!gesture) {
			throw new Error('A multi-selection transform gesture was not created.');
		}

		const commands = transformGestureCommands(gesture, { x: 220, y: 210 });

		expect(commands).toHaveLength(2);
		expect(commands).toMatchObject([
			{ kind: 'update-attachment-transform', attachmentId: fixtureIds.image },
			{ kind: 'update-attachment-transform', attachmentId: fixtureIds.point }
		]);
	});
});
