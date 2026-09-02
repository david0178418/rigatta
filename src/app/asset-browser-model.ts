import type { EntityId } from '../domain/ids.ts';
import type { ImageAsset, Project } from '../domain/model.ts';

export type AssetUsage = Readonly<{
	slotName: string;
	attachmentName: string;
}>;

export type AssetPreview = Readonly<{
	asset: ImageAsset;
	format: string;
	usage: readonly AssetUsage[];
}>;

export const imageFormatFor = function imageFormatFor(mimeType: ImageAsset['mimeType']): string {
	return mimeType.replace('image/', '').toUpperCase();
};

export const assetUsageFor = function assetUsageFor(
	project: Project,
	assetId: EntityId
): readonly AssetUsage[] {
	return project.attachments.flatMap((attachment) => {
		if (attachment.kind !== 'image' || attachment.assetId !== assetId) {
			return [];
		}

		const slot = project.slots.find((candidate) => candidate.id === attachment.slotId);

		return [{
			slotName: slot?.name ?? 'Unknown slot',
			attachmentName: attachment.name
		}];
	});
};

export const assetPreviewFor = function assetPreviewFor(
	project: Project,
	assetId: EntityId | undefined
): AssetPreview | undefined {
	if (!assetId) {
		return undefined;
	}

	const asset = project.assets.find((candidate) => candidate.id === assetId);

	return asset
		? {
			asset,
			format: imageFormatFor(asset.mimeType),
			usage: assetUsageFor(project, asset.id)
		}
		: undefined;
};

export const assetUsageLabelFor = function assetUsageLabelFor(usage: AssetUsage): string {
	return `${usage.slotName} / ${usage.attachmentName}`;
};
