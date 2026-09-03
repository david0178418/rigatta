import { useEffect, useRef, type Ref, type ReactElement } from 'react';
import type { LocalTransform } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { BoneTransformProperty, Clip, NumberKey, Project } from '../domain/model.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import type { SharedInspectorProps } from './shared-inspector.tsx';
import { CollapsibleInspectorSection, SharedInspector } from './shared-inspector.tsx';
import { DirectNameField, DirectNumericField } from './inspector-fields.tsx';
import type { KeyableProperty, PropertyKeyState } from './keying.ts';
import type { NumericProperty } from './property-drafts.ts';
import type { SelectableEntity, Selection } from './selection.ts';
import { frameIndexForTime } from './timeline.ts';

type AttachmentProperty = 'opacity' | 'pivotX' | 'pivotY' | 'width' | 'height';
type EditorMode = 'setup' | 'animate';
type GameplayAttachment = Extract<Project['attachments'][number], { kind: 'point' | 'rectangle' }>;

const attachmentFor = function attachmentFor(
	project: Project,
	entity: SelectableEntity | undefined
): Project['attachments'][number] | undefined {
	return entity?.kind === 'attachment'
		? project.attachments.find((attachment) => attachment.id === entity.id)
		: undefined;
};

const selectedGameplayAttachmentFor = function selectedGameplayAttachmentFor(
	project: Project,
	entity: SelectableEntity | undefined
): GameplayAttachment | undefined {
	const attachment = attachmentFor(project, entity);

	return attachment?.kind === 'point' || attachment?.kind === 'rectangle' ? attachment : undefined;
};

const enabledTrackFor = function enabledTrackFor(
	clip: Clip | undefined,
	attachment: GameplayAttachment | undefined
): Extract<Clip['tracks'][number], { kind: 'point-enabled' | 'rectangle-enabled' }> | undefined {
	if (!clip || !attachment) {
		return undefined;
	}

	const kind = attachment.kind === 'point' ? 'point-enabled' : 'rectangle-enabled';
	const track = clip.tracks.find((candidate) => candidate.kind === kind && candidate.targetId === attachment.id);

	return track?.kind === kind ? track : undefined;
};

const keyedEnabledAtFrame = function keyedEnabledAtFrame(
	clip: Clip | undefined,
	attachment: GameplayAttachment | undefined,
	frameIndex: number
): Readonly<{ frameIndex: number; value: boolean }> | undefined {
	const track = enabledTrackFor(clip, attachment);

	if (!clip || !track) {
		return undefined;
	}

	return track.keys
		.filter((key) => frameIndexForTime(clip, key.timeSeconds) <= frameIndex)
		.reduce<Readonly<{ frameIndex: number; value: boolean }> | undefined>((latest, key) => {
			const keyFrame = frameIndexForTime(clip, key.timeSeconds);

			return !latest || keyFrame > latest.frameIndex
				? { frameIndex: keyFrame, value: key.value }
				: latest;
		}, undefined);
};

const valueText = function valueText(value: boolean): string {
	return value ? 'Enabled' : 'Disabled';
};

const sharedBooleanValue = function sharedBooleanValue(values: readonly (boolean | undefined)[]): boolean | undefined {
	const first = values[0];

	return values.length > 0 && values.every((value) => value === first) ? first : undefined;
};

const mixedBooleanValue = function mixedBooleanValue(values: readonly (boolean | undefined)[]): boolean {
	return values.length > 1 && sharedBooleanValue(values) === undefined;
};

const transformProperties: readonly (keyof LocalTransform)[] = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'];

const latestNumberKeyAtFrame = function latestNumberKeyAtFrame(
	clip: Clip | undefined,
	keys: readonly NumberKey[] | undefined,
	frameIndex: number
): Readonly<{ frameIndex: number; value: number }> | undefined {
	if (!clip || !keys) {
		return undefined;
	}

	return keys
		.map((key) => ({ frameIndex: frameIndexForTime(clip, key.timeSeconds), value: key.value }))
		.filter((entry) => entry.frameIndex <= frameIndex)
		.reduce<Readonly<{ frameIndex: number; value: number }> | undefined>((latest, entry) => (
			!latest || entry.frameIndex > latest.frameIndex ? entry : latest
		), undefined);
};

const keyedTransformAtFrame = function keyedTransformAtFrame(
	clip: Clip | undefined,
	attachment: GameplayAttachment | undefined,
	frameIndex: number
): Readonly<{ frameIndex: number; transform: LocalTransform }> | undefined {
	if (!clip || !attachment) {
		return undefined;
	}

	const keyedValues = transformProperties.flatMap((property) => {
		const track = clip.tracks.find((candidate) => candidate.kind === 'attachment-transform' && candidate.targetId === attachment.id && candidate.property === property);
		const latest = track?.kind === 'attachment-transform' ? latestNumberKeyAtFrame(clip, track.keys, frameIndex) : undefined;

		return latest ? [{ property, ...latest }] : [];
	});

	if (keyedValues.length === 0) {
		return undefined;
	}

	const transform = keyedValues.reduce<LocalTransform>((current, entry) => ({ ...current, [entry.property]: entry.value }), attachment.transform);
	const latestFrame = keyedValues.reduce((current, entry) => Math.max(current, entry.frameIndex), 0);

	return { frameIndex: latestFrame, transform };
};

const keyedRectangleSizeAtFrame = function keyedRectangleSizeAtFrame(
	clip: Clip | undefined,
	attachment: GameplayAttachment | undefined,
	property: 'width' | 'height',
	frameIndex: number
): Readonly<{ frameIndex: number; value: number }> | undefined {
	if (!clip || !attachment || attachment.kind !== 'rectangle') {
		return undefined;
	}

	const track = clip.tracks.find((candidate) => candidate.kind === 'rectangle-size' && candidate.targetId === attachment.id && candidate.property === property);

	return track?.kind === 'rectangle-size' ? latestNumberKeyAtFrame(clip, track.keys, frameIndex) : undefined;
};

const transformSummary = function transformSummary(transform: LocalTransform): string {
	return `x ${transform.x} px · y ${transform.y} px · rotation ${transform.rotation} deg · scale ${transform.scaleX}, ${transform.scaleY}`;
};

export type PropertiesInspectorProps = Readonly<{
	project: Project;
	sharedInspector: SharedInspectorProps;
	showSharedInspector: boolean;
	collapsedSections: ReadonlySet<string>;
	selectedEntity?: SelectableEntity;
	selectedName?: string;
	selection: Selection;
	selectedSlot?: Project['slots'][number];
	selectedTransform?: LocalTransform;
	selectedTransformValue: (property: BoneTransformProperty) => number | undefined;
	selectedTransformIsMixed: (property: BoneTransformProperty) => boolean;
	selectedAttachmentValue: (property: AttachmentProperty) => number | undefined;
	selectedAttachmentIsMixed: (property: AttachmentProperty) => boolean;
	allSelectedTransformable?: boolean;
	allSelectedImages: boolean;
	allSelectedRectangles: boolean;
	activeFrameIndex: number;
	activeClip?: Clip;
	activePose?: EvaluatedPose;
	mode?: EditorMode;
	keyStateForProperty: (entityId: EntityId, property: KeyableProperty) => PropertyKeyState | undefined;
	keyStateMixedForProperty?: (property: KeyableProperty) => boolean;
	onTogglePropertyKey: (property: KeyableProperty) => void;
	onCommitDirectProperty: (property: NumericProperty, value: number) => string | undefined;
	onCommitEnabled?: (value: boolean) => string | undefined;
	onKeyEnabled?: (value: boolean) => void;
	renameInputRef: Ref<HTMLInputElement>;
	onRenameSelected: (name: string) => string | undefined;
	onDeleteSelected: () => void;
	onUpdateSlotAttachment: (slotId: EntityId, attachmentId: EntityId | null) => void;
	keyingAnnouncement?: string;
}>;

const CurrentState = function CurrentState({
	label,
	value,
	detail
}: Readonly<{ label: string; value: string; detail?: string }>): ReactElement {
	return (
		<div className="inspector-value-state">
			<span className="field-label">{label}</span>
			<span>{value}{detail ? ` · ${detail}` : ''}</span>
		</div>
	);
};

const MixedCheckbox = function MixedCheckbox({
	checked,
	mixed,
	label,
	onChange
}: Readonly<{
	checked: boolean;
	mixed: boolean;
	label: string;
	onChange: (value: boolean) => void;
}>): ReactElement {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.indeterminate = mixed;
		}
	}, [mixed]);

	return <input ref={inputRef} aria-checked={mixed ? 'mixed' : checked ? 'true' : 'false'} aria-label={label} checked={checked} type="checkbox" onChange={(event) => onChange(event.currentTarget.checked)} />;
};

export const PropertiesInspector = function PropertiesInspector({
	project,
	sharedInspector,
	showSharedInspector,
	collapsedSections,
	selectedEntity,
	selectedName,
	selection,
	selectedSlot,
	selectedTransform,
	selectedTransformValue,
	selectedTransformIsMixed,
	selectedAttachmentValue,
	selectedAttachmentIsMixed,
	allSelectedTransformable = selection.length > 0 && selection.every((entity) => entity.kind === 'bone' || entity.kind === 'attachment'),
	allSelectedImages,
	allSelectedRectangles,
	activeFrameIndex,
	activeClip,
	activePose,
	mode = 'setup',
	keyStateForProperty,
	keyStateMixedForProperty = (): boolean => false,
	onTogglePropertyKey,
	onCommitDirectProperty,
	onCommitEnabled,
	onKeyEnabled,
	renameInputRef,
	onRenameSelected,
	onDeleteSelected,
	onUpdateSlotAttachment,
	keyingAnnouncement
}: PropertiesInspectorProps): ReactElement {
	const gameplayAttachment = selectedGameplayAttachmentFor(project, selectedEntity);
	const selectedGameplayAttachments = selection.flatMap((entity): readonly GameplayAttachment[] => {
		const attachment = selectedGameplayAttachmentFor(project, entity);

		return attachment ? [attachment] : [];
	});
	const allSelectedGameplay = selection.length > 0 && selectedGameplayAttachments.length === selection.length;
	const selectedEvaluatedAttachment = gameplayAttachment && activePose?.attachments.find((attachment) => attachment.id === gameplayAttachment.id);
	const setupEnabledValue = sharedBooleanValue(selectedGameplayAttachments.map((attachment) => attachment.enabled));
	const setupEnabledMixed = mixedBooleanValue(selectedGameplayAttachments.map((attachment) => attachment.enabled));
	const currentEnabledValues = selectedGameplayAttachments.map((attachment) => {
		const evaluated = activePose?.attachments.find((candidate) => candidate.id === attachment.id);

		return evaluated?.kind === attachment.kind ? evaluated.enabled : attachment.enabled;
	});
	const currentEnabledValue = sharedBooleanValue(currentEnabledValues);
	const currentEnabledMixed = mixedBooleanValue(currentEnabledValues);
	const setupEnabled = setupEnabledValue ?? false;
	const currentEnabled = currentEnabledValue ?? false;
	const keyedEnabled = keyedEnabledAtFrame(activeClip, gameplayAttachment, activeFrameIndex);
	const keyedEnabledValues = selectedGameplayAttachments.map((attachment) => keyedEnabledAtFrame(activeClip, attachment, activeFrameIndex)?.value);
	const keyedEnabledValue = sharedBooleanValue(keyedEnabledValues);
	const keyedEnabledMixed = mixedBooleanValue(keyedEnabledValues);
	const hasKeyedEnabled = keyedEnabledValues.some((value) => value !== undefined);
	const setupTransform = gameplayAttachment?.transform;
	const currentTransform = selectedEvaluatedAttachment?.localTransform ?? setupTransform;
	const keyedTransform = keyedTransformAtFrame(activeClip, gameplayAttachment, activeFrameIndex);
	const setupWidth = gameplayAttachment?.kind === 'rectangle' ? gameplayAttachment.width : undefined;
	const setupHeight = gameplayAttachment?.kind === 'rectangle' ? gameplayAttachment.height : undefined;
	const currentWidth = selectedEvaluatedAttachment?.kind === 'rectangle' ? selectedEvaluatedAttachment.width : setupWidth;
	const currentHeight = selectedEvaluatedAttachment?.kind === 'rectangle' ? selectedEvaluatedAttachment.height : setupHeight;
	const keyedWidth = keyedRectangleSizeAtFrame(activeClip, gameplayAttachment, 'width', activeFrameIndex);
	const keyedHeight = keyedRectangleSizeAtFrame(activeClip, gameplayAttachment, 'height', activeFrameIndex);
	const animateContext = mode === 'animate' && activeClip !== undefined;
	const hasImageSelection = selection.some((entity) => attachmentFor(project, entity)?.kind === 'image');
	const hasRectangleSelection = selection.some((entity) => attachmentFor(project, entity)?.kind === 'rectangle');
	const hasUnsupportedTransformSelection = selection.length > 0 && !allSelectedTransformable;
	const hasMixedKeyState = function hasMixedKeyState(property: KeyableProperty): boolean {
		return animateContext && keyStateMixedForProperty(property);
	};

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
											{!allSelectedGameplay && <DirectNameField
												inputRef={renameInputRef}
												value={selectedName ?? ''}
												name="Selected name"
												onCommit={onRenameSelected}
											/>}
										<div className="inspector-actions">
											<button className="danger-button" type="button" aria-keyshortcuts="Delete Backspace" onClick={onDeleteSelected} title="Delete selection · Delete / Backspace">Delete</button>
										</div>
									</div>
									{hasUnsupportedTransformSelection && <p className="muted-copy" role="note">Transform properties are available only when every selected item is a bone or attachment.</p>}
									{selectedTransform && allSelectedTransformable && !allSelectedGameplay && (
										<CollapsibleInspectorSection
											ariaLabel="Transform properties"
											collapsed={collapsedSections.has('transform')}
											detail={animateContext ? `Current · frame ${activeFrameIndex + 1}` : 'Setup'}
											eyebrow="Transform"
											id="transform"
											label="Transform"
											onToggle={() => sharedInspector.onToggleSection('transform')}
										>
											{animateContext && <p className="muted-copy">Editing the current evaluated pose. Key diamonds target frame {activeFrameIndex + 1}; setup values remain available in Setup mode.</p>}
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
																			keyStateMixed={hasMixedKeyState(property)}
																			mixed={selectedTransformIsMixed(property)}
															onCommit={onCommitDirectProperty}
															onToggleKey={() => onTogglePropertyKey(property)}
															property={property}
															value={selectedTransformValue(property) ?? selectedTransform[property]}
														/>
													))}
												</div>
											</div>
										</CollapsibleInspectorSection>
									)}
									{hasImageSelection && !allSelectedImages && <p className="muted-copy" role="note">Opacity and pivots are available only when every selected attachment is an image.</p>}
									{allSelectedImages && (
										<CollapsibleInspectorSection
											ariaLabel="Image properties"
											collapsed={collapsedSections.has('image-properties')}
											detail={animateContext ? `Current · frame ${activeFrameIndex + 1}` : 'Setup'}
											eyebrow="Attachment"
											id="image-properties"
											label="Image"
											onToggle={() => sharedInspector.onToggleSection('image-properties')}
										>
											<div className="transform-grid compact-grid">
																				<DirectNumericField ariaLabel="Opacity" frameIndex={activeFrameIndex} key={`opacity:${selectedAttachmentValue('opacity')}`} keyState={keyStateForProperty(selectedEntity.id, 'opacity')} keyStateMixed={hasMixedKeyState('opacity')} mixed={selectedAttachmentIsMixed('opacity')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('opacity')} property="opacity" value={selectedAttachmentValue('opacity') ?? 0} />
												<DirectNumericField ariaLabel="Pivot X" key={`pivotX:${selectedAttachmentValue('pivotX')}`} mixed={selectedAttachmentIsMixed('pivotX')} onCommit={onCommitDirectProperty} property="pivotX" value={selectedAttachmentValue('pivotX') ?? 0} />
												<DirectNumericField ariaLabel="Pivot Y" key={`pivotY:${selectedAttachmentValue('pivotY')}`} mixed={selectedAttachmentIsMixed('pivotY')} onCommit={onCommitDirectProperty} property="pivotY" value={selectedAttachmentValue('pivotY') ?? 0} />
											</div>
										</CollapsibleInspectorSection>
									)}
									{hasRectangleSelection && !allSelectedRectangles && <p className="muted-copy" role="note">Rectangle size is available only when every selected attachment is a rectangle.</p>}
										{allSelectedRectangles && !allSelectedGameplay && (
										<CollapsibleInspectorSection
											ariaLabel="Rectangle properties"
											collapsed={collapsedSections.has('rectangle-properties')}
											detail={animateContext ? `Current · frame ${activeFrameIndex + 1}` : 'Setup'}
											eyebrow="Attachment"
											id="rectangle-properties"
											label="Rectangle"
											onToggle={() => sharedInspector.onToggleSection('rectangle-properties')}
										>
											<p className="muted-copy">Size units: px. Exported gameplay rectangles use world-space corners.</p>
											<div className="transform-grid compact-grid">
																				<DirectNumericField ariaLabel="Width (px)" frameIndex={activeFrameIndex} key={`width:${selectedAttachmentValue('width')}`} keyState={keyStateForProperty(selectedEntity.id, 'width')} keyStateMixed={hasMixedKeyState('width')} mixed={selectedAttachmentIsMixed('width')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('width')} property="width" value={selectedAttachmentValue('width') ?? 1} />
																				<DirectNumericField ariaLabel="Height (px)" frameIndex={activeFrameIndex} key={`height:${selectedAttachmentValue('height')}`} keyState={keyStateForProperty(selectedEntity.id, 'height')} keyStateMixed={hasMixedKeyState('height')} mixed={selectedAttachmentIsMixed('height')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('height')} property="height" value={selectedAttachmentValue('height') ?? 1} />
											</div>
										</CollapsibleInspectorSection>
									)}
									{gameplayAttachment && allSelectedGameplay && (
										<CollapsibleInspectorSection
											ariaLabel="Gameplay attachment properties"
											collapsed={collapsedSections.has('gameplay')}
											detail={animateContext ? `Current · frame ${activeFrameIndex + 1}` : 'Setup'}
											eyebrow="Gameplay"
											key={`gameplay:${selectedEntity.kind}:${selectedEntity.id}:${selectedName ?? ''}`}
											id="gameplay"
																				label={gameplayAttachment.kind === 'point' ? 'Point' : 'Rectangle'}
																			onToggle={() => sharedInspector.onToggleSection('gameplay')}
																		>
																			<DirectNameField
																				inputRef={renameInputRef}
																				value={selectedName ?? ''}
																			name="Selected name"
																			onCommit={onRenameSelected}
																		/>
																			{selectedTransform && allSelectedTransformable && <>
																				<p className="muted-copy">Transform units: px for position, degrees for rotation and shear, unitless scale. Setup, current evaluated, and keyed states are shown below.</p>
																				<div className="transform-grid">
																					{(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const).map((property) => (
																						<DirectNumericField
																							ariaLabel={property === 'rotation' ? 'Rotation (deg)' : property === 'shearX' ? 'Shear X (deg)' : property === 'shearY' ? 'Shear Y (deg)' : undefined}
																							frameIndex={activeFrameIndex}
																							key={`gameplay-${property}:${selectedTransformValue(property) ?? selectedTransform[property]}`}
																							keyState={keyStateForProperty(selectedEntity.id, property)}
																							keyStateMixed={hasMixedKeyState(property)}
																							mixed={selectedTransformIsMixed(property)}
																							onCommit={onCommitDirectProperty}
																							onToggleKey={() => onTogglePropertyKey(property)}
																							property={property}
																							value={selectedTransformValue(property) ?? selectedTransform[property]}
																					/>
																					))}
																				</div>
																			</>}
																			{allSelectedRectangles && selectedAttachmentValue('width') !== undefined && selectedAttachmentValue('height') !== undefined && <>
																				<p className="muted-copy">Rectangle size units: positive px. Exported gameplay rectangles use world-space corners.</p>
																				<div className="transform-grid compact-grid">
																						<DirectNumericField ariaLabel="Width (px)" frameIndex={activeFrameIndex} key={`gameplay-width:${selectedAttachmentValue('width')}`} keyState={keyStateForProperty(selectedEntity.id, 'width')} keyStateMixed={hasMixedKeyState('width')} mixed={selectedAttachmentIsMixed('width')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('width')} property="width" value={selectedAttachmentValue('width') ?? 1} />
																						<DirectNumericField ariaLabel="Height (px)" frameIndex={activeFrameIndex} key={`gameplay-height:${selectedAttachmentValue('height')}`} keyState={keyStateForProperty(selectedEntity.id, 'height')} keyStateMixed={hasMixedKeyState('height')} mixed={selectedAttachmentIsMixed('height')} onCommit={onCommitDirectProperty} onToggleKey={() => onTogglePropertyKey('height')} property="height" value={selectedAttachmentValue('height') ?? 1} />
																				</div>
																			</>}
																			{setupTransform && <CurrentState label="Setup transform" value={transformSummary(setupTransform)} />}
											{animateContext && currentTransform && <CurrentState label={`Current evaluated transform · frame ${activeFrameIndex + 1}`} value={transformSummary(currentTransform)} detail={keyedTransform ? `from key at frame ${keyedTransform.frameIndex + 1}` : 'setup fallback'} />}
											{animateContext && keyedTransform && <CurrentState label="Keyed transform" value={transformSummary(keyedTransform.transform)} detail={`frame ${keyedTransform.frameIndex + 1}`} />}
											{gameplayAttachment.kind === 'rectangle' && setupWidth !== undefined && setupHeight !== undefined && <CurrentState label="Setup size" value={`${setupWidth} × ${setupHeight} px`} />}
											{animateContext && gameplayAttachment.kind === 'rectangle' && currentWidth !== undefined && currentHeight !== undefined && <CurrentState label={`Current evaluated size · frame ${activeFrameIndex + 1}`} value={`${currentWidth} × ${currentHeight} px`} detail={keyedWidth || keyedHeight ? `from key at frame ${Math.max(keyedWidth?.frameIndex ?? 0, keyedHeight?.frameIndex ?? 0) + 1}` : 'setup fallback'} />}
											{animateContext && gameplayAttachment.kind === 'rectangle' && (keyedWidth || keyedHeight) && <CurrentState label="Keyed size" value={`${keyedWidth?.value ?? setupWidth} × ${keyedHeight?.value ?? setupHeight} px`} detail={`frame ${Math.max(keyedWidth?.frameIndex ?? 0, keyedHeight?.frameIndex ?? 0) + 1}`} />}
														<CurrentState label="Setup enabled" value={setupEnabledMixed ? 'Mixed' : valueText(setupEnabled)} />
														{animateContext && <CurrentState label={`Current evaluated · frame ${activeFrameIndex + 1}`} value={currentEnabledMixed ? 'Mixed' : valueText(currentEnabled)} detail={keyedEnabled ? `from key at frame ${keyedEnabled.frameIndex + 1}` : 'setup fallback'} />}
														{hasKeyedEnabled && <CurrentState
															label="Keyed value"
															value={keyedEnabledMixed || keyedEnabledValue === undefined ? 'Mixed' : valueText(keyedEnabledValue)}
															detail={selectedGameplayAttachments.length === 1 && keyedEnabled ? `frame ${keyedEnabled.frameIndex + 1}` : 'across selection'}
														/>}
														<label className="shared-checkbox">
															<MixedCheckbox
																checked={animateContext ? currentEnabled : setupEnabled}
																label={animateContext ? 'Current enabled' : 'Setup enabled'}
																mixed={animateContext ? currentEnabledMixed : setupEnabledMixed}
																onChange={(value) => {
																	if (animateContext && onKeyEnabled) {
																		onKeyEnabled(value);
																		return;
																	}

																	onCommitEnabled?.(value);
																}}
															/>
												<span>{animateContext ? 'Key current enabled' : 'Enabled'}</span>
											</label>
											{gameplayAttachment.kind === 'rectangle' && <p className="muted-copy">Width and height are grouped above and constrained to positive px values. Position and rotation are edited as local setup/current transforms.</p>}
										</CollapsibleInspectorSection>
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
								</>
							)}
						</>
					)}
				</CollapsibleInspectorSection>
			</section>
		</div>
	);
};
