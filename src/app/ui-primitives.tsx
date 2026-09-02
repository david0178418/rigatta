import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

export type TabOption<TValue extends string> = Readonly<{
	value: TValue;
	label: string;
	}>;

export const Tabs = function Tabs<TValue extends string>({
	label,
	options,
	value,
	onChange
}: Readonly<{
	label: string;
	options: readonly TabOption<TValue>[];
	value: TValue;
	onChange: (value: TValue) => void;
}>): ReactElement {
	const tabRefs = useRef<Partial<Record<TValue, HTMLButtonElement | null>>>({});
	const focusTab = function focusTab(nextValue: TValue): void {
		tabRefs.current[nextValue]?.focus();
		onChange(nextValue);
	};
	const moveFocus = function moveFocus(currentValue: TValue, direction: -1 | 1): void {
		const index = options.findIndex((option) => option.value === currentValue);
		const next = options[(index + direction + options.length) % options.length];

		if (next) {
			focusTab(next.value);
		}
	};

	return (
		<div className="dock-tabs" role="tablist" aria-label={label}>
			{options.map((option) => (
				<button
					aria-selected={option.value === value}
					className={option.value === value ? 'dock-tab is-active' : 'dock-tab'}
					key={option.value}
					ref={(element) => {
						tabRefs.current[option.value] = element;
					}}
					role="tab"
					tabIndex={option.value === value ? 0 : -1}
					type="button"
					onClick={() => onChange(option.value)}
					onKeyDown={(event) => {
						if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
							event.preventDefault();
							moveFocus(option.value, -1);
						}
						if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
							event.preventDefault();
							moveFocus(option.value, 1);
						}
						if (event.key === 'Home') {
							event.preventDefault();
							const first = options[0];

							if (first) {
								focusTab(first.value);
							}
						}
						if (event.key === 'End') {
							event.preventDefault();
							const last = options.at(-1);

							if (last) {
								focusTab(last.value);
							}
						}
					}}
				>
					{option.label}
				</button>
			))}
		</div>
	);
};

export const Tooltip = function Tooltip({
	label,
	shortcut,
	children
}: Readonly<{
	label: string;
	shortcut?: string;
	children: ReactNode;
}>): ReactElement {
	const text = shortcut ? `${label} · ${shortcut}` : label;

	return <span className="tooltip-wrap" data-tooltip={text}>{children}</span>;
};

export type MenuItem = Readonly<{
	id: string;
	label: string;
	description?: string;
	disabled?: boolean;
	onSelect: () => void;
}>;

export const MenuButton = function MenuButton({
	label,
	items,
	disabled = false,
	className = 'quiet-button'
}: Readonly<{
	label: string;
	items: readonly MenuItem[];
	disabled?: boolean;
	className?: string;
}>): ReactElement {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const closeMenu = function closeMenu(restoreFocus = true): void {
		setOpen(false);

		if (restoreFocus) {
			triggerRef.current?.focus();
		}
	};

	useEffect(() => {
		if (!open) {
			return function cleanup(): void {};
		}

		const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
		firstItem?.focus();
		const onPointerDown = function onPointerDown(event: PointerEvent): void {
			const target = event.target;

			if (target instanceof Node && !menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
				closeMenu(false);
			}
		};
		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeMenu();
			}
		};

		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('keydown', onKeyDown, true);

		return function cleanup(): void {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown, true);
		};
	}, [open]);

	return (
		<span className="menu-wrap">
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				className={className}
				disabled={disabled}
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((current) => !current)}
			>
				{label}
			</button>
			{open && (
				<div className="context-menu" ref={menuRef} role="menu" aria-label={label}>
					{items.map((item) => (
						<button
							className="context-menu-item"
							disabled={item.disabled}
							key={item.id}
							role="menuitem"
							type="button"
							onClick={() => {
								item.onSelect();
								closeMenu();
							}}
						>
							<span>{item.label}</span>
							{item.description && <small>{item.description}</small>}
						</button>
					))}
				</div>
			)}
		</span>
	);
};

export const Popover = function Popover({
	label,
	children,
	className = ''
}: Readonly<{
	label: string;
	children: ReactNode;
	className?: string;
	}>): ReactElement {
	const [open, setOpen] = useState(false);
	const popoverRef = useRef<HTMLSpanElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const close = function close(restoreFocus = true): void {
		setOpen(false);

		if (restoreFocus) {
			triggerRef.current?.focus();
		}
	};

	useEffect(() => {
		if (!open) {
			return function cleanup(): void {};
		}

		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape') {
				event.preventDefault();
				close();
			}
		};
		const onPointerDown = function onPointerDown(event: PointerEvent): void {
			const target = event.target;

			if (target instanceof Node && !popoverRef.current?.contains(target)) {
				close(false);
			}
		};

		document.addEventListener('keydown', onKeyDown, true);
		document.addEventListener('pointerdown', onPointerDown, true);

		return function cleanup(): void {
			document.removeEventListener('keydown', onKeyDown, true);
			document.removeEventListener('pointerdown', onPointerDown, true);
		};
	}, [open]);

	return (
		<span className={`popover-wrap ${className}`.trim()} ref={popoverRef}>
			<button
				aria-expanded={open}
				aria-haspopup="dialog"
				className="quiet-button"
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((current) => !current)}
			>
				{label}
			</button>
			{open && <div className="popover-surface" role="dialog" aria-label={label}>{children}</div>}
		</span>
	);
};

export const Dialog = function Dialog({
	label,
	children,
	onClose
}: Readonly<{
	label: string;
	children: ReactNode;
	onClose: () => void;
}>): ReactElement {
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeRef.current?.focus();
		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};

		document.addEventListener('keydown', onKeyDown, true);

		return function cleanup(): void {
			document.removeEventListener('keydown', onKeyDown, true);
		};
	}, [onClose]);

	return (
		<div className="dialog-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div aria-label={label} aria-modal="true" className="dialog-surface" ref={dialogRef} role="dialog" tabIndex={-1}>
				<div className="dialog-heading">
					<h2>{label}</h2>
					<button aria-label={`Close ${label}`} className="quiet-button" ref={closeRef} type="button" onClick={onClose}>Close</button>
				</div>
				{children}
			</div>
		</div>
	);
};
