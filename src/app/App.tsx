import { useState, type ReactElement } from 'react';

type EditorMode = 'setup' | 'animate';

const modeLabels: Record<EditorMode, string> = {
	setup: 'Setup',
	animate: 'Animate'
};

export const App = function App(): ReactElement {
	const [mode, setMode] = useState<EditorMode>('setup');

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="brand-lockup">
					<span className="brand-mark" aria-hidden="true">BA</span>
					<div>
						<p className="eyebrow">Bone Animation Utility</p>
						<h1>Untitled project</h1>
					</div>
				</div>
				<nav className="mode-switcher" aria-label="Editor mode">
					{(['setup', 'animate'] as const).map((nextMode) => (
						<button
							className={nextMode === mode ? 'mode-button is-active' : 'mode-button'}
							key={nextMode}
							type="button"
							onClick={() => setMode(nextMode)}
							aria-pressed={nextMode === mode}
						>
							{modeLabels[nextMode]}
						</button>
					))}
				</nav>
				<div className="toolbar-actions">
					<button className="quiet-button" type="button" disabled>Undo</button>
					<button className="quiet-button" type="button" disabled>Redo</button>
					<button className="primary-button" type="button">Export</button>
				</div>
			</header>

			<main className="workspace" data-mode={mode}>
				<aside className="panel library-panel" aria-label="Image library">
					<div className="panel-heading">
						<div>
							<p className="eyebrow">Assets</p>
							<h2>Image library</h2>
						</div>
						<button className="icon-button" type="button" aria-label="Import image directory" disabled>+</button>
					</div>
					<label className="search-field">
						<span className="sr-only">Search images</span>
						<input type="search" placeholder="Search images" disabled />
					</label>
					<div className="empty-state compact-state">
						<span className="empty-glyph" aria-hidden="true">◇</span>
						<p>No images imported</p>
						<span>Drop a folder here to begin.</span>
					</div>
				</aside>

				<section className="viewport-panel" aria-label="Canvas viewport">
					<div className="viewport-toolbar">
						<span className="context-label">{modeLabels[mode]} mode</span>
						<span className="viewport-readout">Canvas 1024 × 1024</span>
					</div>
					<div className="viewport-stage">
						<div className="canvas-placeholder" aria-label="Empty 1024 by 1024 canvas">
							<span>Drop image parts here</span>
							<small>Fixed logical canvas · 1024 × 1024</small>
						</div>
					</div>
				</section>

				<aside className="panel inspector-panel" aria-label="Rig hierarchy and inspector">
					<section className="panel-section">
						<div className="panel-heading">
							<div>
								<p className="eyebrow">Rig</p>
								<h2>Hierarchy</h2>
							</div>
							<button className="icon-button" type="button" aria-label="Add rig item" disabled>+</button>
						</div>
						<div className="tree-empty">Create a root bone to see the rig.</div>
					</section>
					<section className="panel-section inspector-section">
						<p className="eyebrow">Inspector</p>
						<h2>Nothing selected</h2>
						<p className="muted-copy">Select a bone, slot, or attachment to edit its properties.</p>
					</section>
				</aside>
			</main>

			<footer className="timeline-panel" aria-label="Animation timeline">
				<div className="timeline-header">
					<div>
						<p className="eyebrow">Animation</p>
						<h2>Timeline</h2>
					</div>
					<span className="muted-copy">No clips yet</span>
				</div>
				<div className="timeline-empty">Create an animation clip when the rig is ready.</div>
			</footer>
		</div>
	);
};
