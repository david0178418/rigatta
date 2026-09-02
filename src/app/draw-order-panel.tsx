import type { DragEvent as ReactDragEvent, ReactElement } from 'react';
import type { EntityId } from '../domain/ids.ts';
import type { Clip, Project } from '../domain/model.ts';
import { frameIndexForTime } from './timeline.ts';
import type { Selection } from './selection.ts';
import { isSelected } from './selection.ts';
import { SLOT_DRAG_MIME } from './rig-tree-view.tsx';

export const DrawOrderPanel = function DrawOrderPanel({
	project,
	activeClip,
	frameIndex,
	selection,
	onSelectionChange,
	onReorder,
	onKeyCurrentFrame
}: Readonly<{
	project: Project;
	activeClip?: Clip;
	frameIndex: number;
	selection: Selection;
	onSelectionChange: (slotId: EntityId, additive: boolean) => void;
	onReorder: (slotId: EntityId, targetIndex: number, order: readonly EntityId[]) => void;
	onKeyCurrentFrame?: () => void;
}>): ReactElement {
	const drawOrderTrack = activeClip?.tracks.find((track) => track.kind === 'slot-draw-order');
	const keyedOrder = drawOrderTrack?.kind === 'slot-draw-order' && activeClip
		? drawOrderTrack.keys.find((key) => frameIndexForTime(activeClip, key.timeSeconds) === frameIndex)
		: undefined;
	const order = keyedOrder?.value ?? project.setupDrawOrder;
	const keyed = keyedOrder !== undefined;
	const slotById = new Map(project.slots.map((slot) => [slot.id, slot] as const));
	const onDragStart = function onDragStart(event: ReactDragEvent<HTMLElement>, slotId: EntityId): void {
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(SLOT_DRAG_MIME, slotId);
	};
	const onDrop = function onDrop(event: ReactDragEvent<HTMLElement>, targetIndex: number): void {
		event.preventDefault();
		const slotId = event.dataTransfer.getData(SLOT_DRAG_MIME);

		if (slotId) {
			onReorder(slotId, targetIndex, order);
		}
	};

	return (
		<section className="draw-order-panel" aria-label="Draw order">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">Setup and Animate</p>
					<h2>Draw Order</h2>
				</div>
				{activeClip && onKeyCurrentFrame && <button className="secondary-button" type="button" onClick={onKeyCurrentFrame}>Key current order</button>}
			</div>
			<p className="muted-copy draw-order-status" aria-live="polite">
				{keyed ? `Keyed order at frame ${frameIndex + 1}` : 'Setup order · back to front'}
			</p>
			{project.slots.length === 0 ? (
				<div className="tree-empty">Create a slot under a bone to edit draw order.</div>
			) : (
				<ol className="draw-order-list" aria-label={keyed ? `Keyed draw order at frame ${frameIndex + 1}` : 'Setup draw order'}>
					{order.map((slotId, index) => {
						const slot = slotById.get(slotId);

						if (!slot) {
							return null;
						}

						return (
							<li className="draw-order-item" data-draw-order-index={index} data-slot-id={slot.id} key={slot.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, index)}>
								<span className="draw-order-index" aria-hidden="true">{index + 1}</span>
								<button
									aria-pressed={isSelected(selection, { kind: 'slot', id: slot.id })}
									className={isSelected(selection, { kind: 'slot', id: slot.id }) ? 'draw-order-row is-selected' : 'draw-order-row'}
									draggable
									type="button"
									onClick={(event) => onSelectionChange(slot.id, event.metaKey || event.ctrlKey)}
									onDragStart={(event) => onDragStart(event, slot.id)}
									title={`Slot ${slot.name} · ${keyed ? 'keyed current-frame order' : 'setup order'}`}
								>
									<span className="rig-icon rig-icon-slot" aria-hidden="true">↳</span>
									<span>{slot.name}</span>
								</button>
							</li>
						);
					})}
				</ol>
			)}
			<p className="muted-copy draw-order-help">Drag a slot to reorder it. Setup changes are saved to the project; keyed order changes apply at the current frame.</p>
		</section>
	);
};
