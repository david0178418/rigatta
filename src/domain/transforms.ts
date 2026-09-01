import {
	identityMatrix,
	invertAffine,
	localTransformToMatrix,
	matrixToLocalTransform,
	multiplyAffine,
	transformPoint,
	type AffineMatrix,
	worldToLocalPoint,
	type Point
} from './coordinates.ts';
import type { EntityId } from './ids.ts';
import type { Bone, Project } from './model.ts';
import { reparentBone } from './operations.ts';
import type { OperationResult } from './operations.ts';
import { validateProject, type ValidationDiagnostic } from './validation.ts';

export type BoneWorldMatrices = ReadonlyMap<EntityId, AffineMatrix>;

export type TransformEvaluation = Readonly<{
	matrices: BoneWorldMatrices;
	diagnostics: readonly ValidationDiagnostic[];
}>;

const findBone = function findBone(project: Project, boneId: EntityId): Bone | undefined {
	return project.bones.find((bone) => bone.id === boneId);
};

const calculateBoneWorldMatrix = function calculateBoneWorldMatrix(
	project: Project,
	boneId: EntityId,
	ancestors: ReadonlySet<EntityId>
): AffineMatrix | undefined {
	if (ancestors.has(boneId)) {
		return undefined;
	}

	const bone = findBone(project, boneId);

	if (!bone) {
		return undefined;
	}

	const localMatrix = localTransformToMatrix(bone.transform);

	if (bone.parentId === null) {
		return localMatrix;
	}

	const parentWorldMatrix = calculateBoneWorldMatrix(
		project,
		bone.parentId,
		new Set([...ancestors, boneId])
	);

	return parentWorldMatrix ? multiplyAffine(parentWorldMatrix, localMatrix) : undefined;
};

export const evaluateBoneWorldMatrices = function evaluateBoneWorldMatrices(
	project: Project
): TransformEvaluation {
	const diagnostics = validateProject(project);
	const matrices = new Map(
		project.bones.flatMap((bone) => {
			const matrix = calculateBoneWorldMatrix(project, bone.id, new Set());
			return matrix ? [[bone.id, matrix] as const] : [];
		})
	);

	return { matrices, diagnostics };
};

export const worldPointForBone = function worldPointForBone(
	evaluation: TransformEvaluation,
	boneId: EntityId,
	localPoint: Point
): Point | undefined {
	const worldMatrix = evaluation.matrices.get(boneId);

	return worldMatrix ? transformPoint(worldMatrix, localPoint) : undefined;
};

export const localPointForBone = function localPointForBone(
	evaluation: TransformEvaluation,
	boneId: EntityId,
	worldPoint: Point
): Point | undefined {
	const worldMatrix = evaluation.matrices.get(boneId);

	return worldMatrix ? worldToLocalPoint(worldMatrix, worldPoint) : undefined;
};

export const preserveWorldPoseOnReparent = function preserveWorldPoseOnReparent(
	project: Project,
	boneId: EntityId,
	newParentId: EntityId | null
): OperationResult<Project> {
	const bone = findBone(project, boneId);
	const evaluation = evaluateBoneWorldMatrices(project);
	const parentChange = reparentBone(project, boneId, newParentId);

	if (!bone) {
		return { ok: false, error: { code: 'not-found', message: 'Bone does not exist.' } };
	}
	if (!parentChange.ok) {
		return parentChange;
	}
	if (evaluation.diagnostics.length > 0) {
		return { ok: false, error: { code: 'invalid-pose', message: 'Cannot preserve pose for an invalid project.' } };
	}

	const oldWorldMatrix = evaluation.matrices.get(boneId);
	const newParentWorldMatrix = newParentId === null
		? identityMatrix()
		: evaluation.matrices.get(newParentId);

	if (!oldWorldMatrix || !newParentWorldMatrix) {
		return { ok: false, error: { code: 'invalid-pose', message: 'Bone world pose could not be evaluated.' } };
	}

	const inverseParent = invertAffine(newParentWorldMatrix);

	if (!inverseParent) {
		return { ok: false, error: { code: 'invalid-pose', message: 'New parent transform cannot be inverted.' } };
	}

	const nextLocalTransform = matrixToLocalTransform(multiplyAffine(inverseParent, oldWorldMatrix));

	if (!nextLocalTransform) {
		return { ok: false, error: { code: 'invalid-pose', message: 'Preserved local transform cannot be decomposed.' } };
	}

	return {
		ok: true,
		value: {
			...parentChange.value,
			bones: parentChange.value.bones.map((candidate) => candidate.id === boneId
				? { ...candidate, parentId: newParentId, transform: nextLocalTransform }
				: candidate)
		}
	};
};
