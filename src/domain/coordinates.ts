export type Point = Readonly<{
	x: number;
	y: number;
}>;

export type LocalTransform = Readonly<{
	x: number;
	y: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
	shearX: number;
	shearY: number;
}>;

export type AffineMatrix = Readonly<{
	a: number;
	b: number;
	c: number;
	d: number;
	tx: number;
	ty: number;
}>;

export const TRANSFORM_EPSILON = 1e-10;

export const DEFAULT_LOCAL_TRANSFORM = {
	x: 0,
	y: 0,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
	shearX: 0,
	shearY: 0
} as const satisfies LocalTransform;

const isFiniteNumber = function isFiniteNumber(value: number): boolean {
	return Number.isFinite(value);
};

export const isFiniteLocalTransform = function isFiniteLocalTransform(
	transform: LocalTransform
): boolean {
	return [
		transform.x,
		transform.y,
		transform.rotation,
		transform.scaleX,
		transform.scaleY,
		transform.shearX,
		transform.shearY
	].every(isFiniteNumber);
};

export const identityMatrix = function identityMatrix(): AffineMatrix {
	return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
};

export const transformPoint = function transformPoint(
	matrix: AffineMatrix,
	point: Point
): Point {
	return {
		x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
		y: matrix.b * point.x + matrix.d * point.y + matrix.ty
	};
};

export const multiplyAffine = function multiplyAffine(
	left: AffineMatrix,
	right: AffineMatrix
): AffineMatrix {
	return {
		a: left.a * right.a + left.c * right.b,
		b: left.b * right.a + left.d * right.b,
		c: left.a * right.c + left.c * right.d,
		d: left.b * right.c + left.d * right.d,
		tx: left.a * right.tx + left.c * right.ty + left.tx,
		ty: left.b * right.tx + left.d * right.ty + left.ty
	};
};

export const composeAffine = function composeAffine(
	matrices: readonly AffineMatrix[]
): AffineMatrix {
	return matrices.reduce(
		(composed, matrix) => multiplyAffine(composed, matrix),
		identityMatrix()
	);
};

const translationMatrix = function translationMatrix(x: number, y: number): AffineMatrix {
	return { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y };
};

const rotationMatrix = function rotationMatrix(angle: number): AffineMatrix {
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);

	return { a: cosine, b: sine, c: -sine, d: cosine, tx: 0, ty: 0 };
};

const horizontalShearMatrix = function horizontalShearMatrix(angle: number): AffineMatrix {
	return { a: 1, b: 0, c: Math.tan(angle), d: 1, tx: 0, ty: 0 };
};

const verticalShearMatrix = function verticalShearMatrix(angle: number): AffineMatrix {
	return { a: 1, b: Math.tan(angle), c: 0, d: 1, tx: 0, ty: 0 };
};

const scaleMatrix = function scaleMatrix(scaleX: number, scaleY: number): AffineMatrix {
	return { a: scaleX, b: 0, c: 0, d: scaleY, tx: 0, ty: 0 };
};

export const localTransformToMatrix = function localTransformToMatrix(
	transform: LocalTransform
): AffineMatrix {
	if (!isFiniteLocalTransform(transform)) {
		throw new RangeError('Local transforms must contain finite numbers.');
	}

	return composeAffine([
		translationMatrix(transform.x, transform.y),
		rotationMatrix(transform.rotation),
		horizontalShearMatrix(transform.shearX),
		verticalShearMatrix(transform.shearY),
		scaleMatrix(transform.scaleX, transform.scaleY)
	]);
};

export const invertAffine = function invertAffine(
	matrix: AffineMatrix
): AffineMatrix | undefined {
	const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

	if (!Number.isFinite(determinant) || Math.abs(determinant) <= TRANSFORM_EPSILON) {
		return undefined;
	}

	const inverseDeterminant = 1 / determinant;

	return {
		a: matrix.d * inverseDeterminant,
		b: -matrix.b * inverseDeterminant,
		c: -matrix.c * inverseDeterminant,
		d: matrix.a * inverseDeterminant,
		tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) * inverseDeterminant,
		ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) * inverseDeterminant
	};
};

export const worldToLocalPoint = function worldToLocalPoint(
	worldMatrix: AffineMatrix,
	worldPoint: Point
): Point | undefined {
	const inverse = invertAffine(worldMatrix);

	if (!inverse) {
		return undefined;
	}

	return transformPoint(inverse, worldPoint);
};

export const degreesToRadians = function degreesToRadians(degrees: number): number {
	return degrees * Math.PI / 180;
};

export const radiansToDegrees = function radiansToDegrees(radians: number): number {
	return radians * 180 / Math.PI;
};
