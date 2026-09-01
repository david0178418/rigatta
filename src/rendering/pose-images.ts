import { localTransformToMatrix, multiplyAffine, type AffineMatrix } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import type { ImageAttachment, Project } from '../domain/model.ts';

export type ImageRenderInstance = Readonly<{
	attachment: ImageAttachment;
	worldMatrix: AffineMatrix;
	opacity: number;
}>;

const instanceForSetupImage = function instanceForSetupImage(
	project: Project,
	attachment: ImageAttachment,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): ImageRenderInstance | undefined {
	const slot = project.slots.find((candidate) => candidate.id === attachment.slotId);
	const boneMatrix = slot ? matrixByBone.get(slot.boneId) : undefined;

	return slot && boneMatrix
		? {
			attachment,
			worldMatrix: multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)),
			opacity: attachment.opacity
		}
		: undefined;
};

export const setupImageRenderInstances = function setupImageRenderInstances(
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): readonly ImageRenderInstance[] {
	const attachmentsById = new Map(project.attachments.map((attachment) => [attachment.id, attachment] as const));
	const slotsById = new Map(project.slots.map((slot) => [slot.id, slot] as const));

	return project.setupDrawOrder.flatMap((slotId) => {
		const slot = slotsById.get(slotId);
		const attachment = slot?.setupAttachmentId ? attachmentsById.get(slot.setupAttachmentId) : undefined;

		return attachment?.kind === 'image'
			? [instanceForSetupImage(project, attachment, matrixByBone)].flatMap((instance) => instance ? [instance] : [])
			: [];
	});
};

export const poseImageRenderInstances = function poseImageRenderInstances(
	project: Project,
	pose: EvaluatedPose
): readonly ImageRenderInstance[] {
	const attachmentsById = new Map(project.attachments.map((attachment) => [attachment.id, attachment] as const));
	const slotsById = new Map(pose.slots.map((slot) => [slot.id, slot] as const));
	const evaluatedImagesById = new Map(pose.attachments.flatMap((attachment) => attachment.kind === 'image'
		? [[attachment.id, attachment] as const]
		: []));

	return pose.drawOrder.flatMap((slotId) => {
		const activeAttachmentId = slotsById.get(slotId)?.activeAttachmentId;
		const evaluated = activeAttachmentId ? evaluatedImagesById.get(activeAttachmentId) : undefined;
		const attachment = activeAttachmentId ? attachmentsById.get(activeAttachmentId) : undefined;

		return attachment?.kind === 'image' && evaluated
			? [{ attachment, worldMatrix: evaluated.worldMatrix, opacity: evaluated.opacity }]
			: [];
	});
};
