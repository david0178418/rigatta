import { Children, cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type ReactNode } from 'react';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const focusableElements = function focusableElements(container: ParentNode | null): readonly HTMLElement[] {
	return container
		? [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
		: [];
};

const focusRelativeElements = function focusRelativeElements(
	elements: readonly HTMLElement[],
	current: HTMLElement,
	direction: -1 | 1
): void {
	const currentIndex = elements.indexOf(current);

	if (currentIndex < 0 || elements.length === 0) {
		return;
	}

	elements[(currentIndex + direction + elements.length) % elements.length]?.focus();
};

const focusRelativeElement = function focusRelativeElement(
	container: ParentNode | null,
	current: HTMLElement,
	direction: -1 | 1
): void {
	focusRelativeElements(focusableElements(container), current, direction);
};

const floatingOffsetFor = function floatingOffsetFor(element: HTMLElement): Readonly<{ x: number; y: number }> {
	const bounds = element.getBoundingClientRect();
	const margin = 8;
	const x = bounds.left < margin
		? margin - bounds.left
		: bounds.right > window.innerWidth - margin
			? window.innerWidth - margin - bounds.right
			: 0;
	const y = bounds.top < margin
		? margin - bounds.top
		: bounds.bottom > window.innerHeight - margin
			? window.innerHeight - margin - bounds.bottom
			: 0;

	return { x, y };
};

const useFloatingOffset = function useFloatingOffset(
	open: boolean,
	elementRef: Readonly<{ current: HTMLElement | null }>,
	transformFor: (x: number, y: number) => string = (x, y) => `translate(${x}px, ${y}px)`
): CSSProperties {
	const [offset, setOffset] = useState<Readonly<{ x: number; y: number }>>({ x: 0, y: 0 });

	useLayoutEffect(() => {
		if (!open) {
			setOffset((current) => current.x === 0 && current.y === 0 ? current : { x: 0, y: 0 });
			return function cleanup(): void {};
		}

		const reposition = function reposition(): void {
			const element = elementRef.current;

			if (!element) {
				return;
			}

			const nextOffset = floatingOffsetFor(element);
			setOffset((current) => current.x === nextOffset.x && current.y === nextOffset.y ? current : nextOffset);
		};

		reposition();
		window.addEventListener('resize', reposition);
		window.visualViewport?.addEventListener('resize', reposition);

		return function cleanup(): void {
			window.removeEventListener('resize', reposition);
			window.visualViewport?.removeEventListener('resize', reposition);
		};
	}, [elementRef, open]);

	return offset.x === 0 && offset.y === 0
		? {}
		: { transform: transformFor(offset.x, offset.y) };
};

const tooltipPositionFor = function tooltipPositionFor(
	anchor: HTMLElement,
	tooltip: HTMLElement
): CSSProperties {
	const anchorBounds = anchor.getBoundingClientRect();
	const tooltipBounds = tooltip.getBoundingClientRect();
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const edge = 8;
	const gap = 6;
	const centeredLeft = anchorBounds.left + anchorBounds.width / 2;
	const minimumLeft = Math.min(viewportWidth / 2, edge + tooltipBounds.width / 2);
	const maximumLeft = Math.max(viewportWidth / 2, viewportWidth - edge - tooltipBounds.width / 2);
	const left = Math.max(minimumLeft, Math.min(maximumLeft, centeredLeft));
	const below = anchorBounds.bottom + gap;
	const above = anchorBounds.top - gap - tooltipBounds.height;
	const top = below + tooltipBounds.height <= viewportHeight - edge
		? below
		: Math.max(edge, above);

	return {
		top: `${top}px`,
		left: `${left}px`,
		transform: 'translateX(-50%)'
	};
};

const useTooltipPosition = function useTooltipPosition(
	open: boolean,
	anchorRef: Readonly<{ current: HTMLElement | null }>,
	tooltipRef: Readonly<{ current: HTMLElement | null }>
): CSSProperties {
	const [position, setPosition] = useState<CSSProperties>({});

	useLayoutEffect(() => {
		if (!open) {
			setPosition((current) => Object.keys(current).length === 0 ? current : {});
			return function cleanup(): void {};
		}

		const reposition = function reposition(): void {
			const anchor = anchorRef.current;
			const tooltip = tooltipRef.current;

			if (!anchor || !tooltip) {
				return;
			}

			const nextPosition = tooltipPositionFor(anchor, tooltip);

			setPosition((current) => current.top === nextPosition.top
				&& current.left === nextPosition.left
				&& current.transform === nextPosition.transform
				? current
				: nextPosition);
		};

		reposition();
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);
		window.visualViewport?.addEventListener('resize', reposition);

		return function cleanup(): void {
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', reposition, true);
			window.visualViewport?.removeEventListener('resize', reposition);
		};
	}, [anchorRef, open, tooltipRef]);

	return position;
};

export type TabOption<TValue extends string> = Readonly<{
	value: TValue;
	label: string;
	id?: string;
	panelId?: string;
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
		<div className="dock-tabs" role="tablist" aria-label={label} aria-orientation="horizontal">
			{options.map((option) => (
				<button
					aria-selected={option.value === value}
					aria-controls={option.panelId}
					className={option.value === value ? 'dock-tab is-active' : 'dock-tab'}
					id={option.id}
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
	className = '',
	children
}: Readonly<{
	label: string;
	shortcut?: string;
	className?: string;
	children: ReactNode;
}>): ReactElement {
	const text = shortcut ? `${label} · ${shortcut}` : label;
	const tooltipId = `tooltip-${useId()}`;
	const [visible, setVisible] = useState(false);
	const anchorRef = useRef<HTMLSpanElement>(null);
	const tooltipRef = useRef<HTMLSpanElement>(null);
	const tooltipStyle = useTooltipPosition(visible, anchorRef, tooltipRef);
	const describedChildren = Children.map(children, (child) => {
		if (!isValidElement<{ 'aria-describedby'?: string }>(child)) {
			return child;
		}

		const describedBy = [child.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');

		return cloneElement(child, { 'aria-describedby': describedBy });
	});

	const hideOnBlur = function hideOnBlur(event: ReactFocusEvent<HTMLSpanElement>): void {
		const nextTarget = event.relatedTarget;

		if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
			setVisible(false);
		}
	};

	return (
		<span
			className={`tooltip-wrap ${className}`.trim()}
			data-tooltip={text}
			ref={anchorRef}
			onBlur={hideOnBlur}
			onFocus={() => setVisible(true)}
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={() => setVisible(false)}
		>
			{describedChildren}
			<span aria-hidden={!visible} className="tooltip-content" id={tooltipId} ref={tooltipRef} role="tooltip" style={tooltipStyle}>{text}</span>
		</span>
	);
};

export const Toolbar = function Toolbar({
	label,
	children,
	orientation = 'horizontal',
	className = '',
	testId
}: Readonly<{
	label: string;
	children: ReactNode;
	orientation?: 'horizontal' | 'vertical';
	className?: string;
	testId?: string;
}>): ReactElement {
	const toolbarRef = useRef<HTMLDivElement>(null);
	const toolbarItems = function toolbarItems(): readonly HTMLElement[] {
		const toolbar = toolbarRef.current;

		return focusableElements(toolbar).filter((element) => element.closest('[role="toolbar"]') === toolbar);
	};
	const setToolbarTabStops = function setToolbarTabStops(
		elements: readonly HTMLElement[],
		focusedElement?: HTMLElement
	): void {
		const activeElement = focusedElement && elements.includes(focusedElement)
			? focusedElement
			: elements[0];

		elements.forEach((element) => {
			element.tabIndex = element === activeElement ? 0 : -1;
		});
	};

	useLayoutEffect(() => {
		const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

		setToolbarTabStops(toolbarItems(), activeElement);
		return function cleanup(): void {};
	}, [children]);

	const onFocus = function onFocus(event: ReactFocusEvent<HTMLDivElement>): void {
		const target = event.target;
		const current = target instanceof HTMLElement
			? toolbarItems().find((element) => element === target || element.contains(target))
			: undefined;

		if (current) {
			setToolbarTabStops(toolbarItems(), current);
		}
	};

	const onKeyDown = function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const target = event.target;
		const isFormTarget = target instanceof HTMLInputElement
			|| target instanceof HTMLTextAreaElement
			|| target instanceof HTMLSelectElement
			|| target instanceof HTMLElement && target.isContentEditable;

		if (event.defaultPrevented || isFormTarget) {
			return;
		}

		const direction = orientation === 'vertical'
			? event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
			: event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;

		if (direction !== 0) {
			event.preventDefault();
			event.stopPropagation();
			const elements = toolbarItems();
			const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : event.currentTarget;
			const current = elements.find((element) => element === activeElement || element.contains(activeElement));

			if (current) {
				focusRelativeElements(elements, current, direction);
			}
			return;
		}

		if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			event.stopPropagation();
			const elements = toolbarItems();
			(event.key === 'Home' ? elements[0] : elements.at(-1))?.focus();
		}
	};

	return (
		<div
			aria-label={label}
			aria-orientation={orientation}
			className={`toolbar ${className}`.trim()}
			data-testid={testId}
			ref={toolbarRef}
			role="toolbar"
			onFocus={onFocus}
			onKeyDown={onKeyDown}
		>
			{children}
		</div>
	);
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
	const menuId = `menu-${useId()}`;
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const initialFocusRef = useRef<'first' | 'last'>('first');
	const floatingStyle = useFloatingOffset(open, menuRef);
	const menuItems = function menuItems(): readonly HTMLElement[] {
		return focusableElements(menuRef.current).filter((element) => element.getAttribute('role') === 'menuitem');
	};
	const closeMenu = function closeMenu(restoreFocus = true): void {
		setOpen(false);

		if (restoreFocus) {
			triggerRef.current?.focus();
		}
	};
	const openMenu = function openMenu(initialFocus: 'first' | 'last' = 'first'): void {
		initialFocusRef.current = initialFocus;
		setOpen(true);
	};

	useEffect(() => {
		if (!open) {
			return function cleanup(): void {};
		}

		const items = menuItems();
		(initialFocusRef.current === 'first' ? items[0] : items.at(-1))?.focus();
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
	const onTriggerKeyDown = function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openMenu('first');
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			openMenu('last');
		}
	};
	const onMenuItemKeyDown = function onMenuItemKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			focusRelativeElement(menuRef.current, event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
		}
		if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			const items = menuItems();
			(event.key === 'Home' ? items[0] : items.at(-1))?.focus();
		}
	};

	return (
		<span className="menu-wrap">
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				aria-controls={open ? menuId : undefined}
				className={className}
				disabled={disabled}
				ref={triggerRef}
				type="button"
				onClick={() => open ? closeMenu() : openMenu()}
				onKeyDown={onTriggerKeyDown}
			>
				{label}
			</button>
			{open && (
				<div aria-label={label} aria-orientation="vertical" className="context-menu" id={menuId} ref={menuRef} role="menu" style={floatingStyle} tabIndex={-1}>
					{items.map((item) => (
						<button
							aria-label={item.label}
							aria-disabled={item.disabled || undefined}
							aria-describedby={item.description ? `${menuId}-${item.id}-description` : undefined}
							className="context-menu-item"
							disabled={item.disabled}
							key={item.id}
							role="menuitem"
							type="button"
							onClick={() => {
								item.onSelect();
								closeMenu();
							}}
							onKeyDown={onMenuItemKeyDown}
						>
							<span>{item.label}</span>
							{item.description && <small id={`${menuId}-${item.id}-description`}>{item.description}</small>}
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
	const popoverId = `popover-${useId()}`;
	const popoverRef = useRef<HTMLSpanElement>(null);
	const surfaceRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const close = function close(restoreFocus = true): void {
		setOpen(false);

		if (restoreFocus) {
			triggerRef.current?.focus();
		}
	};
	const floatingStyle = useFloatingOffset(open, surfaceRef);

	useEffect(() => {
		if (!open) {
			return function cleanup(): void {};
		}

		const firstFocusable = focusableElements(surfaceRef.current)[0];
		(firstFocusable ?? surfaceRef.current)?.focus();
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
				aria-controls={open ? popoverId : undefined}
				className="quiet-button"
				ref={triggerRef}
				type="button"
				onClick={() => open ? close() : setOpen(true)}
				onKeyDown={(event) => {
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
						event.preventDefault();
						setOpen(true);
					}
				}}
			>
				{label}
			</button>
			{open && <div aria-label={label} className="popover-surface" id={popoverId} ref={surfaceRef} role="dialog" style={floatingStyle} tabIndex={-1}>{children}</div>}
		</span>
	);
};

export const Dialog = function Dialog({
	label,
	children,
	onClose,
	className = '',
	overlayClassName = '',
	id
}: Readonly<{
	label: string;
	children: ReactNode;
	onClose: () => void;
	className?: string;
	overlayClassName?: string;
	id?: string;
}>): ReactElement {
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const dialogTitleId = `dialog-title-${useId()}`;
	const openerRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		closeRef.current?.focus();
		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape') {
				event.preventDefault();
				onCloseRef.current();
				return;
			}
			if (event.key !== 'Tab') {
				return;
			}

			const elements = focusableElements(dialogRef.current);

			if (elements.length === 0) {
				event.preventDefault();
				dialogRef.current?.focus();
				return;
			}

			const activeElement = document.activeElement;
			const first = elements[0];
			const last = elements.at(-1);

			if (!last) {
				return;
			}
			if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
				event.preventDefault();
				last.focus();
				return;
			}
			if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
				event.preventDefault();
				first?.focus();
			}
		};

		document.addEventListener('keydown', onKeyDown, true);

		return function cleanup(): void {
			document.removeEventListener('keydown', onKeyDown, true);
			openerRef.current?.focus();
		};
	}, []);

	return (
		<div className={`dialog-overlay ${overlayClassName}`.trim()} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div aria-labelledby={dialogTitleId} aria-modal="true" className={`dialog-surface ${className}`.trim()} id={id} ref={dialogRef} role="dialog" tabIndex={-1}>
				<div className="dialog-heading">
					<h2 id={dialogTitleId}>{label}</h2>
					<button aria-label={`Close ${label}`} className="quiet-button" ref={closeRef} type="button" onClick={onClose}>Close</button>
				</div>
				{children}
			</div>
		</div>
	);
};
