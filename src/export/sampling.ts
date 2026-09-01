import type { EntityId } from '../domain/ids.ts';
import { frameCountForClip } from '../domain/playback.ts';
import {
	evaluatePose,
	gameplayFrameFromPose,
	type EvaluatedGameplayFrame,
	type EvaluatedPose,
	type PoseDiagnostic
} from '../domain/pose.ts';
import type { Project } from '../domain/model.ts';
import { validateProject, type ValidationDiagnostic } from '../domain/validation.ts';

export type SampledClipFrame = Readonly<{
	clipId: EntityId;
	index: number;
	timeSeconds: number;
	pose: EvaluatedPose;
	gameplay: EvaluatedGameplayFrame;
}>;

export type ClipFrameSamplingResult = Readonly<{
	frames: readonly SampledClipFrame[];
	diagnostics: readonly (ValidationDiagnostic | PoseDiagnostic)[];
}>;

const missingClipDiagnostic = function missingClipDiagnostic(): PoseDiagnostic {
	return {
		code: 'missing-clip',
		path: 'clipId',
		message: 'Animation clip does not exist.'
	};
};

export const sampleClipFrames = function sampleClipFrames(
	project: Project,
	clipId: EntityId
): ClipFrameSamplingResult {
	const clip = project.clips.find((candidate) => candidate.id === clipId);
	const diagnostics = [
		...validateProject(project),
		...(clip ? [] : [missingClipDiagnostic()])
	];

	if (!clip || diagnostics.length > 0) {
		return { frames: [], diagnostics };
	}

	const evaluations = Array.from({ length: frameCountForClip(clip) }, (_, index) => {
		const timeSeconds = index / clip.fps;
		const poseResult = evaluatePose(project, clip.id, timeSeconds);

		if (!poseResult.pose) {
			return {
				frame: undefined,
				diagnostics: poseResult.diagnostics
			};
		}

		return {
			frame: {
				clipId: clip.id,
				index,
				timeSeconds,
				pose: poseResult.pose,
				gameplay: gameplayFrameFromPose(poseResult.pose)
			},
			diagnostics: poseResult.diagnostics
		};
	});

	return {
		frames: evaluations.flatMap((evaluation) => evaluation.frame ? [evaluation.frame] : []),
		diagnostics: [
			...diagnostics,
			...evaluations.flatMap((evaluation) => evaluation.diagnostics)
		]
	};
};
