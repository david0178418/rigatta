import {
	localTransformToMatrix,
	multiplyAffine,
	transformPoint,
	type AffineMatrix,
	type Point
} from './coordinates.ts';
import type { EntityId } from './ids.ts';
import type { EvaluatedPose } from './pose.ts';
import type { Attachment, ImageAttachment, Project } from './model.ts';
import { evaluateBoneWorldMatrices } from './transforms.ts';

export type CanvasEdge = 'left' | 'top' | 'right' | 'bottom';

export type CanvasBounds = Readonly<{
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}>;

export type CanvasWarning = Readonly<{
	code: 'canvas-clipping' | 'canvas-overflow';
	attachmentId: EntityId;
	attachmentName: string;
	kind: Attachment['kind'];
	edges: readonly CanvasEdge[];
	bounds: CanvasBounds;
	message: string;
}>;

type WarningSample = Readonly<{
	attachmentId: EntityId;
	attachmentName: string;
	kind: Attachment['kind'];
	points: readonly Point[];
}>;

const pointsAreFinite = function pointsAreFinite(points: readonly Point[]): boolean {
	return points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
};

const boundsForPoints = function boundsForPoints(points: readonly Point[]): CanvasBounds | undefined {
	if (points.length === 0 || !pointsAreFinite(points)) {
		return undefined;
	}

	return points.reduce<CanvasBounds>(
		(bounds, point) => ({
			minX: Math.min(bounds.minX, point.x),
			minY: Math.min(bounds.minY, point.y),
			maxX: Math.max(bounds.maxX, point.x),
			maxY: Math.max(bounds.maxY, point.y)
		}),
		{ minX: points[0]?.x ?? 0, minY: points[0]?.y ?? 0, maxX: points[0]?.x ?? 0, maxY: points[0]?.y ?? 0 }
	);
};

const edgesForBounds = function edgesForBounds(
	bounds: CanvasBounds,
	width: number,
	height: number
): readonly CanvasEdge[] {
	return [
		...(bounds.minX < 0 ? ['left' as const] : []),
		...(bounds.minY < 0 ? ['top' as const] : []),
		...(bounds.maxX > width ? ['right' as const] : []),
		...(bounds.maxY > height ? ['bottom' as const] : [])
	];
};

const isEntirelyOutside = function isEntirelyOutside(
	bounds: CanvasBounds,
	width: number,
	height: number
): boolean {
	return bounds.maxX < 0 || bounds.minX > width || bounds.maxY < 0 || bounds.minY > height;
};

const edgeLabel = function edgeLabel(edges: readonly CanvasEdge[]): string {
	return edges.join(', ');
};

const warningForSample = function warningForSample(
	sample: WarningSample,
	canvas: Project['logicalCanvas']
): CanvasWarning | undefined {
	const bounds = boundsForPoints(sample.points);

	if (!bounds) {
		return undefined;
	}

	const edges = edgesForBounds(bounds, canvas.width, canvas.height);

	if (edges.length === 0) {
		return undefined;
	}

	const code = isEntirelyOutside(bounds, canvas.width, canvas.height)
		? 'canvas-overflow'
		: 'canvas-clipping';
	const action = code === 'canvas-overflow' ? 'is fully outside' : 'extends beyond';

	return {
		code,
		attachmentId: sample.attachmentId,
		attachmentName: sample.attachmentName,
		kind: sample.kind,
		edges,
		bounds,
		message: `${sample.kind} attachment “${sample.attachmentName}” ${action} the logical canvas on the ${edgeLabel(edges)} edge${edges.length === 1 ? '' : 's'}.`
	};
};

const warningsForSamples = function warningsForSamples(
	project: Project,
	samples: readonly WarningSample[]
): readonly CanvasWarning[] {
	return samples.flatMap((sample) => {
		const warning = warningForSample(sample, project.logicalCanvas);

		return warning ? [warning] : [];
	});
};

const imagePoints = function imagePoints(
	attachment: Pick<ImageAttachment, 'pivotX' | 'pivotY'>,
	asset: Readonly<{ width: number; height: number }>,
	matrix: AffineMatrix
): readonly Point[] {
	return [
		transformPoint(matrix, { x: -attachment.pivotX * asset.width, y: -attachment.pivotY * asset.height }),
		transformPoint(matrix, { x: (1 - attachment.pivotX) * asset.width, y: -attachment.pivotY * asset.height }),
		transformPoint(matrix, { x: (1 - attachment.pivotX) * asset.width, y: (1 - attachment.pivotY) * asset.height }),
		transformPoint(matrix, { x: -attachment.pivotX * asset.width, y: (1 - attachment.pivotY) * asset.height })
	];
};

const matrixForAttachment = function matrixForAttachment(
	project: Project,
	attachment: Attachment,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): AffineMatrix | undefined {
	const boneId = attachment.kind === 'image'
		? project.slots.find((slot) => slot.id === attachment.slotId)?.boneId
		: attachment.boneId;
	const boneMatrix = boneId ? matrixByBone.get(boneId) : undefined;

	return boneMatrix
		? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform))
		: undefined;
};

const sampleForSetupAttachment = function sampleForSetupAttachment(
	project: Project,
	attachment: Attachment,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): WarningSample | undefined {
	const matrix = matrixForAttachment(project, attachment, matrixByBone);

	if (!matrix) {
		return undefined;
	}

	if (attachment.kind === 'image') {
		const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);

		return asset
			? { attachmentId: attachment.id, attachmentName: attachment.name, kind: attachment.kind, points: imagePoints(attachment, asset, matrix) }
			: undefined;
	}
	if (attachment.kind === 'point') {
		return {
			attachmentId: attachment.id,
			attachmentName: attachment.name,
			kind: attachment.kind,
			points: [transformPoint(matrix, { x: 0, y: 0 })]
		};
	}

	return {
		attachmentId: attachment.id,
		attachmentName: attachment.name,
		kind: attachment.kind,
		points: [
			transformPoint(matrix, { x: -attachment.width / 2, y: -attachment.height / 2 }),
			transformPoint(matrix, { x: attachment.width / 2, y: -attachment.height / 2 }),
			transformPoint(matrix, { x: attachment.width / 2, y: attachment.height / 2 }),
			transformPoint(matrix, { x: -attachment.width / 2, y: attachment.height / 2 })
		]
	};
};

export const canvasWarningsForSetup = function canvasWarningsForSetup(
	project: Project
): readonly CanvasWarning[] {
	const matrices = evaluateBoneWorldMatrices(project).matrices;
	const setupAttachmentIds = new Set(project.slots.flatMap((slot) => slot.setupAttachmentId ? [slot.setupAttachmentId] : []));
	const samples = project.attachments
		.filter((attachment) => attachment.kind !== 'image' || setupAttachmentIds.has(attachment.id))
		.flatMap((attachment) => {
			const sample = sampleForSetupAttachment(project, attachment, matrices);

			return sample ? [sample] : [];
		});

	return warningsForSamples(project, samples);
};

export const canvasWarningsForPose = function canvasWarningsForPose(
	project: Project,
	pose: EvaluatedPose
): readonly CanvasWarning[] {
	const samples = pose.attachments.flatMap((attachment): readonly WarningSample[] => {
		if (attachment.kind === 'image') {
			if (!attachment.active || attachment.opacity <= 0) {
				return [];
			}

			const source = project.attachments.find((candidate) => candidate.id === attachment.id);
			const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);

			return source?.kind === 'image' && asset
				? [{ attachmentId: source.id, attachmentName: source.name, kind: source.kind, points: imagePoints(source, asset, attachment.worldMatrix) }]
				: [];
		}

		return attachment.kind === 'point'
			? [{ attachmentId: attachment.id, attachmentName: project.attachments.find((candidate) => candidate.id === attachment.id)?.name ?? attachment.id, kind: attachment.kind, points: [attachment.position] }]
			: [{ attachmentId: attachment.id, attachmentName: project.attachments.find((candidate) => candidate.id === attachment.id)?.name ?? attachment.id, kind: attachment.kind, points: attachment.corners }];
	});

	return warningsForSamples(project, samples);
};
