import type { DragEvent as ReactDragEvent, ReactElement } from 'react';
import type { EntityId } from '../domain/ids.ts';
import type { Clip, Project } from '../domain/model.ts';
import { drawOrderViewForFrame, reorderDrawOrder } from './draw-order-model.ts';
import type { Selection } from './selection.ts';
import { isSelected } from './selection.ts';
import { SLOT_DRAG_MIME } from './rig-tree-view.tsx';

type DrawOrderMode = 'setup' | 'animate';

export const DrawOrderPanel = function DrawOrderPanel({
	project,
	activeClip,
	mode,
	frameIndex,
	selection,
	onSelectionChange,
	onReorder,
	onKeyCurrentFrame
}: Readonly<{
	project: Project;
	activeClip?: Clip;
	mode?: DrawOrderMode;
	frameIndex: number;
	selection: Selection;
	onSelectionChange: (slotId: EntityId, additive: boolean) => void;
	onReorder: (slotId: EntityId, targetIndex: number, order: readonly EntityId[]) => void;
	onKeyCurrentFrame?: (order: readonly EntityId[]) => void;
}>): ReactElement {
	const isAnimateMode = mode === 'animate' || (mode === undefined && onKeyCurrentFrame !== undefined);
	const drawOrderView = drawOrderViewForFrame(project, isAnimateMode ? activeClip : undefined, frameIndex);
	const order = drawOrderView.order;
	const keyed = drawOrderView.source === 'keyed';
	const slotById = new Map(project.slots.map((slot) => [slot.id, slot] as const));
	const onDragStart = function onDragStart(event: ReactDragEvent<HTMLElement>, slotId: EntityId): void {
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(SLOT_DRAG_MIME, slotId);
		event.dataTransfer.setData('text/plain', slotId);
	};
	const onDrop = function onDrop(event: ReactDragEvent<HTMLElement>, targetIndex: number): void {
		event.preventDefault();
		const slotId = event.dataTransfer.getData(SLOT_DRAG_MIME);
		const nextOrder = slotId ? reorderDrawOrder(order, slotId, targetIndex) : order;

		if (slotId && nextOrder.some((candidate, index) => candidate !== order[index])) {
			onReorder(slotId, targetIndex, order);
		}
	};
	const status = isAnimateMode
		? keyed
			? `Animate · Keyed order at frame ${frameIndex + 1} · current override from frame ${(drawOrderView.keyFrameIndex ?? frameIndex) + 1} · back to front`
			: 'Animate · Setup order · back to front'
		: 'Setup · Setup order · back to front';
	const listLabel = keyed
		? `Keyed draw order at frame ${frameIndex + 1}, from frame ${(drawOrderView.keyFrameIndex ?? frameIndex) + 1}, back to front`
		: `${isAnimateMode ? 'Animate · ' : ''}Setup draw order, back to front`;
	const reorderHelp = isAnimateMode
		? 'Drag a slot to edit the evaluated order at the current frame. Key current order records it as an explicit key.'
		: 'Drag a slot to reorder setup order. The first row is farthest back; the last row is farthest front.';

	return (
		<section className="draw-order-panel" aria-label="Draw order" data-draw-order-source={drawOrderView.source} data-mode={isAnimateMode ? 'animate' : 'setup'} data-testid="draw-order-panel">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">Setup and Animate</p>
					<h2>Draw Order</h2>
				</div>
				{isAnimateMode && activeClip && onKeyCurrentFrame && <button className="secondary-button" data-testid="key-current-draw-order" type="button" title={`Key current draw order at frame ${frameIndex + 1}`} onClick={() => onKeyCurrentFrame(order)}>Key current order</button>}
			</div>
			<p className="muted-copy draw-order-status" aria-live="polite">
				{status}
			</p>
			<div className="draw-order-direction" aria-label="Draw order direction">
				<span>Back</span>
				<span aria-hidden="true">→</span>
				<span>Front</span>
			</div>
			{project.slots.length === 0 ? (
				<div className="tree-empty">Create a slot under a bone to edit draw order.</div>
			) : (
				<ol className="draw-order-list" aria-label={listLabel} data-draw-order-key-frame={drawOrderView.keyFrameIndex}>
					{order.map((slotId, index) => {
						const slot = slotById.get(slotId);

						if (!slot) {
							return null;
						}

						return (
							<li className="draw-order-item" data-draw-order-index={index} data-draw-order-position={index + 1} data-slot-id={slot.id} key={slot.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => onDrop(event, index)}>
								<span className="draw-order-index" aria-hidden="true">{index + 1}</span>
								<button
									aria-pressed={isSelected(selection, { kind: 'slot', id: slot.id })}
									className={isSelected(selection, { kind: 'slot', id: slot.id }) ? 'draw-order-row is-selected' : 'draw-order-row'}
									draggable
									type="button"
									onClick={(event) => onSelectionChange(slot.id, event.metaKey || event.ctrlKey)}
									onDragStart={(event) => onDragStart(event, slot.id)}
									title={`Slot ${slot.name} · position ${index + 1} of ${order.length} · ${keyed ? 'keyed override' : 'setup order'}`}
								>
									<span className="rig-icon rig-icon-slot" aria-hidden="true">↳</span>
									<span>{slot.name}</span>
								</button>
							</li>
						);
					})}
				</ol>
			)}
			<p className="muted-copy draw-order-help">{reorderHelp}</p>
		</section>
	);
};
