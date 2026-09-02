import { describe, expect, test } from 'bun:test';
import { localTransformToMatrix, multiplyAffine, transformPoint } from '../../src/domain/coordinates.ts';
import { evaluateBoneWorldMatrices } from '../../src/domain/transforms.ts';
import { canvasGestureModeFor, createTransformGesture, isTransformHandleHit, rectangleSizeForGesture, transformGestureCommand, transformGestureCommands, transformGestureValuesFor } from '../../src/app/transform-gesture.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

describe('setup transform gestures', () => {
	test('resolves gesture precedence before transform hit testing', () => {
		const cases = [
			{ button: 1, space: false, transformClaimed: true, expected: 'pan' },
			{ button: 0, space: true, transformClaimed: true, expected: 'pan' },
			{ button: 0, space: false, transformClaimed: true, expected: 'transform' },
			{ button: 0, space: false, transformClaimed: false, expected: 'marquee' }
		] as const;

		cases.forEach(({ button, space, transformClaimed, expected }) => {
			expect(canvasGestureModeFor(button, space, transformClaimed)).toBe(expected);
		});
	});

	test('computes the Shift constraint matrix as pure values', () => {
		expect(transformGestureValuesFor('translate', { x: 20, y: 8 }, 0, true)).toEqual({
			delta: { x: 20, y: 0 },
			angleDelta: 0,
			scaleXFactor: 1,
			scaleYFactor: 1
		});
		expect(transformGestureValuesFor('shear', { x: 7, y: -13 }, 0, true).delta).toEqual({ x: 0, y: -13 });
		expect(transformGestureValuesFor('rotate', { x: 7, y: -13 }, Math.PI / 10, true).angleDelta).toBeCloseTo(Math.PI / 12);
		expect(transformGestureValuesFor('scale', { x: 20, y: -8 }, 0, true).scaleXFactor).toBe(1.2);
		expect(transformGestureValuesFor('scale', { x: 20, y: -8 }, 0, true).scaleYFactor).toBe(1.2);
	});

	test('preserves the rectangle aspect ratio when Shift resizes either axis', () => {
		expect(rectangleSizeForGesture({ width: 20, height: 30 }, 'width', { width: 30, height: 999 }, true)).toEqual({ width: 30, height: 45 });
		expect(rectangleSizeForGesture({ width: 20, height: 30 }, 'height', { width: 999, height: 45 }, true)).toEqual({ width: 30, height: 45 });
	});

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

	test('applies axis, angle, and uniform-scale constraints to transform commands', () => {
		const project = createRigProject();
		const translate = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'translate', { shiftKey: true });
		const rotate = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 120, y: 50 }, 'rotate', { shiftKey: true });
		const scale = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'scale', { shiftKey: true });
		const shear = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'shear', { shiftKey: true });

		if (!translate || !rotate || !scale || !shear) {
			throw new Error('Constrained root transform gestures were not created.');
		}

		expect(transformGestureCommand(translate, { x: 120, y: 65 })).toMatchObject({ transform: { x: 120, y: 50 } });
		expect(transformGestureCommand(rotate, { x: 100 + 20 * Math.cos(Math.PI / 10), y: 50 + 20 * Math.sin(Math.PI / 10) })).toMatchObject({ transform: { rotation: Math.PI / 12 } });
		expect(transformGestureCommand(scale, { x: 150, y: 25 })).toMatchObject({ transform: { scaleX: 1.5, scaleY: 1.5 } });
		expect(transformGestureCommand(shear, { x: 150, y: 25 })).toMatchObject({ transform: { shearX: 0.5, shearY: 0 } });
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

	test('resizes rectangle dimensions from rectangle-specific scale handles', () => {
		const project = createRigProject();
		const rectangle = project.attachments.find((attachment) => attachment.id === fixtureIds.rectangle);

		if (!rectangle || rectangle.kind !== 'rectangle') {
			throw new Error('The fixture rectangle is unavailable.');
		}

		const boneMatrix = evaluateBoneWorldMatrices(project).matrices.get(rectangle.boneId);

		if (!boneMatrix) {
			throw new Error('The fixture rectangle bone matrix is unavailable.');
		}

		const rectangleWorldMatrix = multiplyAffine(boneMatrix, localTransformToMatrix(rectangle.transform));
		const startPoint = transformPoint(rectangleWorldMatrix, { x: rectangle.width / 2, y: 0 });
		const gesture = createTransformGesture(project, { kind: 'attachment', id: fixtureIds.rectangle }, startPoint, 'scale');

		if (!gesture) {
			throw new Error('The rectangle resize gesture was not created.');
		}

		expect(isTransformHandleHit(project, { kind: 'attachment', id: fixtureIds.rectangle }, startPoint, 'scale')).toBe(true);
		expect(transformGestureCommand(gesture, transformPoint(rectangleWorldMatrix, { x: rectangle.width / 2 + 5, y: 0 }))).toMatchObject({
			kind: 'update-rectangle-size',
			attachmentId: fixtureIds.rectangle,
			width: 30,
			height: 30
		});
	});

	test('applies a constrained aspect ratio to rectangle resize commands', () => {
		const project = createRigProject();
		const rectangle = project.attachments.find((attachment) => attachment.id === fixtureIds.rectangle);

		if (!rectangle || rectangle.kind !== 'rectangle') {
			throw new Error('The fixture rectangle is unavailable.');
		}

		const boneMatrix = evaluateBoneWorldMatrices(project).matrices.get(rectangle.boneId);

		if (!boneMatrix) {
			throw new Error('The fixture rectangle bone matrix is unavailable.');
		}

		const rectangleWorldMatrix = multiplyAffine(boneMatrix, localTransformToMatrix(rectangle.transform));
		const startPoint = transformPoint(rectangleWorldMatrix, { x: rectangle.width / 2, y: 0 });
		const gesture = createTransformGesture(project, { kind: 'attachment', id: fixtureIds.rectangle }, startPoint, 'scale', { shiftKey: true });

		if (!gesture) {
			throw new Error('The constrained rectangle resize gesture was not created.');
		}

		expect(transformGestureCommand(gesture, transformPoint(rectangleWorldMatrix, { x: rectangle.width / 2 + 5, y: 0 }))).toMatchObject({
			kind: 'update-rectangle-size',
			attachmentId: fixtureIds.rectangle,
			width: 30,
			height: 45
		});
	});
});
