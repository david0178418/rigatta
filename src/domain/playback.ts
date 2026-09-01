import type { Clip } from './model.ts';

export type PlaybackDirection = -1 | 1;

export type PlaybackState = Readonly<{
	frameIndex: number;
	playing: boolean;
	remainderSeconds: number;
}>;

const clampFrame = function clampFrame(frameIndex: number, frameCount: number): number {
	const finiteFrame = Number.isFinite(frameIndex) ? Math.floor(frameIndex) : 0;

	return Math.max(0, Math.min(frameCount - 1, finiteFrame));
};

const frameCountForClip = function frameCountForClip(clip: Clip): number {
	return Math.max(1, Math.ceil(clip.durationSeconds * clip.fps));
};

const remainderForState = function remainderForState(state: PlaybackState): number {
	return Number.isFinite(state.remainderSeconds) && state.remainderSeconds >= 0
		? state.remainderSeconds
		: 0;
};

export const createPlaybackState = function createPlaybackState(frameIndex: number = 0): PlaybackState {
	return {
		frameIndex: Number.isFinite(frameIndex) ? Math.max(0, Math.floor(frameIndex)) : 0,
		playing: false,
		remainderSeconds: 0
	};
};

export const seekPlayback = function seekPlayback(
	state: PlaybackState,
	clip: Clip,
	frameIndex: number
): PlaybackState {
	return {
		...state,
		frameIndex: clampFrame(frameIndex, frameCountForClip(clip)),
		playing: false,
		remainderSeconds: 0
	};
};

export const stepPlayback = function stepPlayback(
	state: PlaybackState,
	clip: Clip,
	direction: PlaybackDirection
): PlaybackState {
	const frameCount = frameCountForClip(clip);
	const currentFrame = clampFrame(state.frameIndex, frameCount);
	const nextFrame = currentFrame + direction;
	const frameIndex = clip.loop
		? (nextFrame + frameCount) % frameCount
		: Math.max(0, Math.min(frameCount - 1, nextFrame));

	return {
		frameIndex,
		playing: false,
		remainderSeconds: 0
	};
};

export const togglePlayback = function togglePlayback(
	state: PlaybackState,
	clip: Clip
): PlaybackState {
	const frameCount = frameCountForClip(clip);
	const currentFrame = clampFrame(state.frameIndex, frameCount);
	const restart = !state.playing && !clip.loop && currentFrame === frameCount - 1;

	return {
		frameIndex: restart ? 0 : currentFrame,
		playing: !state.playing,
		remainderSeconds: 0
	};
};

export const advancePlayback = function advancePlayback(
	state: PlaybackState,
	clip: Clip,
	deltaSeconds: number
): PlaybackState {
	if (!state.playing || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
		return state;
	}

	const frameCount = frameCountForClip(clip);
	const frameDuration = 1 / clip.fps;
	const elapsed = remainderForState(state) + deltaSeconds;
	const frameDelta = Math.floor((elapsed + Number.EPSILON) / frameDuration);
	const remainderSeconds = elapsed - frameDelta * frameDuration;

	if (frameDelta === 0) {
		return { ...state, remainderSeconds };
	}

	const currentFrame = clampFrame(state.frameIndex, frameCount);
	const nextFrame = currentFrame + frameDelta;

	if (clip.loop) {
		return {
			frameIndex: nextFrame % frameCount,
			playing: true,
			remainderSeconds
		};
	}

	const frameIndex = Math.min(frameCount - 1, nextFrame);

	return {
		frameIndex,
		playing: frameIndex < frameCount - 1,
		remainderSeconds: frameIndex === frameCount - 1 ? 0 : remainderSeconds
	};
};

export const frameTimeSeconds = function frameTimeSeconds(
	state: PlaybackState,
	clip: Clip
): number {
	return clampFrame(state.frameIndex, frameCountForClip(clip)) / clip.fps;
};

export { frameCountForClip };
