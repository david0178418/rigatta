import type { ProjectCommand } from '../domain/commands.ts';
import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';

export type SlotDropZone = 'before' | 'after';

export const slotDropCommands = function slotDropCommands(
	project: Project,
	sourceId: EntityId,
	targetId: EntityId,
	zone: SlotDropZone
): readonly ProjectCommand[] | undefined {
	if (!project.slots.some((slot) => slot.id === sourceId)
		|| !project.slots.some((slot) => slot.id === targetId)) {
		return undefined;
	}
	if (sourceId === targetId) {
		return [];
	}

	const withoutSource = project.setupDrawOrder.filter((slotId) => slotId !== sourceId);
	const targetIndex = withoutSource.indexOf(targetId);

	if (targetIndex < 0) {
		return undefined;
	}

	return [{
		kind: 'reorder-slot',
		slotId: sourceId,
		targetIndex: targetIndex + (zone === 'after' ? 1 : 0)
	}];
};

export const slotDropZoneForClientY = function slotDropZoneForClientY(
	top: number,
	height: number,
	clientY: number
): SlotDropZone {
	return height > 0 && (clientY - top) / height < 0.5 ? 'before' : 'after';
};
