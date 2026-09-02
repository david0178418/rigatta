import type { Ref, ReactElement } from 'react';
import type { LocalTransform } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { BoneTransformProperty, Project } from '../domain/model.ts';
import type { SharedInspectorProps } from './shared-inspector.tsx';
import { CollapsibleInspectorSection, SharedInspector } from './shared-inspector.tsx';
import { DirectNameField, DirectNumericField } from './inspector-fields.tsx';
import type { KeyableProperty, PropertyKeyState } from './keying.ts';
import type { NumericProperty } from './property-drafts.ts';
import type { SelectableEntity, Selection } from './selection.ts';

type AttachmentProperty = 'opacity' | 'pivotX' | 'pivotY' | 'width' | 'height';

export type PropertiesInspectorProps = Readonly<{
	project: Project;
	sharedInspector: SharedInspectorProps;
	showSharedInspector: boolean;
	collapsedSections: ReadonlySet<string>;
	selectedEntity?: SelectableEntity;
	selectedName?: string;
	selection: Selection;
	selectedBone?: Project['bones'][number];
	selectedSlot?: Project['slots'][number];
	selectedTransform?: LocalTransform;
	selectedTransformValue: (property: BoneTransformProperty) => number | undefined;
	selectedTransformIsMixed: (property: BoneTransformProperty) => boolean;
	selectedAttachmentValue: (property: AttachmentProperty) => number | undefined;
	selectedAttachmentIsMixed: (property: AttachmentProperty) => boolean;
	allSelectedImages: boolean;
	allSelectedRectangles: boolean;
	activeFrameIndex: number;
	keyStateForProperty: (entityId: EntityId, property: KeyableProperty) => PropertyKeyState | undefined;
	onTogglePropertyKey: (property: KeyableProperty) => void;
	onCommitDirectProperty: (property: NumericProperty, value: number) => string | undefined;
	renameInputRef: Ref<HTMLInputElement>;
	onRenameSelected: (name: string) => string | undefined;
	onDeleteSelected: () => void;
	onUpdateSlotAttachment: (slotId: EntityId, attachmentId: EntityId | null) => void;
	onAddChildBone: () => void;
	onAddSlot: () => void;
	onAddPointAttachment: () => void;
	onAddRectangleAttachment: () => void;
	keyingAnnouncement?: string;
}>;

export const PropertiesInspector = function PropertiesInspector({
	project,
	sharedInspector,
	showSharedInspector,
	collapsedSections,
	selectedEntity,
	selectedName,
	selection,
	selectedBone,
	selectedSlot,
	selectedTransform,
	selectedTransformValue,
	selectedTransformIsMixed,
	selectedAttachmentValue,
	selectedAttachmentIsMixed,
	allSelectedImages,
	allSelectedRectangles,
	activeFrameIndex,
	keyStateForProperty,
	onTogglePropertyKey,
	onCommitDirectProperty,
	renameInputRef,
	onRenameSelected,
	onDeleteSelected,
	onUpdateSlotAttachment,
	onAddChildBone,
	onAddSlot,
	onAddPointAttachment,
	onAddRectangleAttachment,
	keyingAnnouncement
}: PropertiesInspectorProps): ReactElement {
	return (
		<div data-testid="properties-inspector">
			{showSharedInspector && <SharedInspector {...sharedInspector} />}
			<section className="panel-section inspector-section">
				<p className="eyebrow">Inspector</p>
				<h2>{selectedName ?? 'Nothing selected'}</h2>
				<CollapsibleInspectorSection
					ariaLabel="Entity properties"
					collapsed={collapsedSections.has('entity-properties')}
					detail={selectedName ?? 'Nothing selected'}
					eyebrow="Selection"
					id="entity-properties"
					label="Entity properties"
					onToggle={() => sharedInspector.onToggleSection('entity-properties')}
				>
					{!selectedEntity ? (
						<p className="muted-copy">Select a bone, slot, attachment, or image to edit its properties.</p>
					) : (
						<>
							<p className="muted-copy">{`${selection.length} item${selection.length === 1 ? '' : 's'} selected.`}</p>
							{keyingAnnouncement && <p className="sr-only" data-testid="keying-status" role="status" aria-live="polite">{keyingAnnouncement}</p>}
							{selectedEntity.kind === 'asset' ? (
								<p className="muted-copy">Drag this source image into the canvas to create a part.</p>
							) : (
								<>
									<div className="inspector-form" key={`${selectedEntity.kind}:${selectedEntity.id}:${selectedName ?? ''}`}>
										<DirectNameField
											inputRef={renameInputRef}
											value={selectedName ?? ''}
											name="Selected name"
											onCommit={onRenameSelected}
										/>
										<div className="inspector-actions">
											<button className="danger-button" type="button" onClick={onDeleteSelected}>Delete</button>
										</div>
									</div>
									{selectedTransform && (
										<div
											className="inspector-form transform-form"
											key={`${selectedEntity.kind}:${selectedEntity.id}:${selectedTransform.x}:${selectedTransform.y}:${selectedTransform.rotation}:${selectedTransform.scaleX}:${selectedTransform.scaleY}:${selectedTransform.shearX}:${selectedTransform.shearY}`}
										>
											<div className="transform-grid">
												{(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const).map((property) => (
													<DirectNumericField
														ariaLabel={property === 'rotation' ? 'Rotation (deg)' : property === 'shearX' ? 'Shear X (deg)' : property === 'shearY' ? 'Shear Y (deg)' : undefined}
														frameIndex={activeFrameIndex}
														key={`${property}:${selectedTransformValue(property) ?? selectedTransform[property]}`}
														keyState={keyStateForProperty(selectedEntity.id, property)}
														mixed={selectedTransformIsMixed(property)}
														onCommit={onCommitDirectProperty}
														onToggleKey={() => onTogglePropertyKey(property)}
														property={property}
														value={selectedTransformValue(property) ?? selectedTransform[property]}
													/>
												))}
											</div>
											{allSelectedImages && selectedAttachmentValue('opacity') !== undefined && (
												<div className="transform-grid compact-grid">
													<DirectNumericField frameIndex={activeFrameIndex} key={`opacity:${selectedAttachmentValue('opacity')}`} keyState={keyStateForProperty(selectedEntity.id, 'opacity')} mixed={selectedAttachmentIsMixed('opacity')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('opacity')} property="opacity" value={selectedAttachmentValue('opacity') ?? 0} />
													<DirectNumericField key={`pivotX:${selectedAttachmentValue('pivotX')}`} mixed={selectedAttachmentIsMixed('pivotX')} onCommit={onCommitDirectProperty} property="pivotX" value={selectedAttachmentValue('pivotX') ?? 0} />
													<DirectNumericField key={`pivotY:${selectedAttachmentValue('pivotY')}`} mixed={selectedAttachmentIsMixed('pivotY')} onCommit={onCommitDirectProperty} property="pivotY" value={selectedAttachmentValue('pivotY') ?? 0} />
												</div>
											)}
											{allSelectedRectangles && selectedAttachmentValue('width') !== undefined && selectedAttachmentValue('height') !== undefined && (
												<div className="transform-grid compact-grid">
													<DirectNumericField frameIndex={activeFrameIndex} key={`width:${selectedAttachmentValue('width')}`} keyState={keyStateForProperty(selectedEntity.id, 'width')} mixed={selectedAttachmentIsMixed('width')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('width')} property="width" value={selectedAttachmentValue('width') ?? 0} />
													<DirectNumericField frameIndex={activeFrameIndex} key={`height:${selectedAttachmentValue('height')}`} keyState={keyStateForProperty(selectedEntity.id, 'height')} mixed={selectedAttachmentIsMixed('height')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('height')} property="height" value={selectedAttachmentValue('height') ?? 0} />
												</div>
											)}
										</div>
									)}
									{selectedSlot && (
										<div className="inspector-form slot-assignment-form">
											<label>
												<span className="field-label">Setup image</span>
												<select
													aria-label="Setup image"
													value={selectedSlot.setupAttachmentId ?? ''}
													onChange={(event) => onUpdateSlotAttachment(selectedSlot.id, event.target.value || null)}
												>
													<option value="">None</option>
													{project.attachments
														.filter((attachment) => attachment.kind === 'image' && attachment.slotId === selectedSlot.id)
														.map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.name}</option>)}
												</select>
											</label>
											<p className="muted-copy">Draw order {project.setupDrawOrder.indexOf(selectedSlot.id) + 1} of {project.setupDrawOrder.length}. Drag slots to reorder them.</p>
											<p className="muted-copy">Drop an image from the library onto this slot to add a setup attachment.</p>
										</div>
									)}
									{selectedBone && (
										<div className="inspector-actions inspector-create-actions">
											<button className="secondary-button" type="button" onClick={onAddChildBone}>Add child bone</button>
											<button className="secondary-button" type="button" onClick={onAddSlot}>Add slot</button>
											<button className="secondary-button" type="button" onClick={onAddPointAttachment}>Add point</button>
											<button className="secondary-button" type="button" onClick={onAddRectangleAttachment}>Add rectangle</button>
										</div>
									)}
								</>
							)}
						</>
					)}
				</CollapsibleInspectorSection>
			</section>
		</div>
	);
};
