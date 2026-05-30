// DraggableCallOverlay.jsx
import React from "react";
import ReactDOM from "react-dom";
import { Paper, useTheme, Link, Stack, Typography, IconButton } from "@mui/material";
import PhoneIcon from "@mui/icons-material/Phone";
import CloseIcon from "@mui/icons-material/Close";

// ----- DRAGGABLE (class) -----
class Draggable extends React.Component {
	static defaultProps = {
		initialPos: { x: 24, y: 24 },
		style: {},
		className: "",
		snap: true,
		snapThreshold: 48,
		snapPadding: 12,
		snapWhileDragging: false,
		snapAnchors: ["top-left", "left", "bottom-left", "top", "center", "right", "top-right", "bottom-right"],
		zIndex: 2147483647, // above everything
	};

	constructor(props) {
		super(props);
		this.state = {
			pos: props.initialPos || { x: 24, y: 24 },
			dragging: false,
			rel: null,
		};
		this.nodeRef = React.createRef();

		this.onMouseDown = this.onMouseDown.bind(this);
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onMouseUp = this.onMouseUp.bind(this);

		this.onTouchStart = this.onTouchStart.bind(this);
		this.onTouchMove = this.onTouchMove.bind(this);
		this.onTouchEnd = this.onTouchEnd.bind(this);

		this.snapToClosest = this.snapToClosest.bind(this);
		this.clampToViewport = this.clampToViewport.bind(this);
		this.handleResize = this.handleResize.bind(this);
	}

	componentDidUpdate(prevProps, prevState) {
		// mouse listeners
		if (this.state.dragging && !prevState.dragging) {
			document.addEventListener("mousemove", this.onMouseMove, { passive: false });
			document.addEventListener("mouseup", this.onMouseUp, { passive: false });
			document.addEventListener("touchmove", this.onTouchMove, { passive: false });
			document.addEventListener("touchend", this.onTouchEnd, { passive: false });
		} else if (!this.state.dragging && prevState.dragging) {
			document.removeEventListener("mousemove", this.onMouseMove);
			document.removeEventListener("mouseup", this.onMouseUp);
			document.removeEventListener("touchmove", this.onTouchMove);
			document.removeEventListener("touchend", this.onTouchEnd);
		}
	}

	componentDidMount() {
		window.addEventListener("resize", this.handleResize);
	}
	componentWillUnmount() {
		document.removeEventListener("mousemove", this.onMouseMove);
		document.removeEventListener("mouseup", this.onMouseUp);
		document.removeEventListener("touchmove", this.onTouchMove);
		document.removeEventListener("touchend", this.onTouchEnd);
		window.removeEventListener("resize", this.handleResize);
	}

	// Always use viewport as the container
	getViewportRect() {
		return {
			left: window.scrollX,
			top: window.scrollY,
			width: window.innerWidth,
			height: window.innerHeight,
		};
	}

	clampToViewport(pos) {
		const node = this.nodeRef.current;
		const { snapPadding } = this.props;
		if (!node) return pos;

		const { width: vw, height: dvh } = this.getViewportRect();
		const nw = node.offsetWidth || 0;
		const nh = node.offsetHeight || 0;

		const xMin = snapPadding;
		const yMin = snapPadding;
		const xMax = vw - nw - snapPadding;
		const yMax = dvh - nh - snapPadding;

		return {
			x: Math.min(xMax, Math.max(xMin, pos.x)),
			y: Math.min(yMax, Math.max(yMin, pos.y)),
		};
	}

	getAnchorPoints() {
		const { snapPadding, snapAnchors } = this.props;
		const node = this.nodeRef.current;
		const { width: vw, height: dvh } = this.getViewportRect();

		const nw = node?.offsetWidth ?? 0;
		const nh = node?.offsetHeight ?? 0;

		const centers = {
			xLeft: snapPadding,
			xCenter: (vw - nw) / 2,
			xRight: vw - nw - snapPadding,
			yTop: snapPadding,
			yCenter: (dvh - nh) / 2,
			yBottom: dvh - nh - snapPadding,
		};

		const all = {
			"top-left": { x: centers.xLeft, y: centers.yTop },
			top: { x: centers.xCenter, y: centers.yTop },
			"top-right": { x: centers.xRight, y: centers.yTop },
			left: { x: centers.xLeft, y: centers.yCenter },
			center: { x: centers.xCenter, y: centers.yCenter },
			right: { x: centers.xRight, y: centers.yCenter },
			"bottom-left": { x: centers.xLeft, y: centers.yBottom },
			bottom: { x: centers.xCenter, y: centers.yBottom },
			"bottom-right": { x: centers.xRight, y: centers.yBottom },
		};

		return Object.fromEntries(Object.entries(all).filter(([k]) => snapAnchors.includes(k)));
	}

	snapToClosest(pos) {
		const { snap, snapThreshold } = this.props;
		if (!snap) return this.clampToViewport(pos);

		const anchors = this.getAnchorPoints();
		let best = null;
		let bestDist = Infinity;

		for (const p of Object.values(anchors)) {
			const dx = pos.x - p.x;
			const dy = pos.y - p.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestDist) {
				bestDist = d2;
				best = p;
			}
		}
		if (!best) return this.clampToViewport(pos);

		const within = Math.sqrt(bestDist) <= (typeof snapThreshold === "number" ? snapThreshold : 48);
		const snapped = within ? best : pos;
		return this.clampToViewport(snapped);
	}

	onMouseDown(e) {
		if (e.button !== 0) return;
		const node = this.nodeRef.current;
		if (!node) return;

		const rect = node.getBoundingClientRect();
		this.setState({
			dragging: true,
			rel: { x: e.clientX - rect.left, y: e.clientY - rect.top },
		});

		e.stopPropagation();
		e.preventDefault();
	}

	onMouseMove(e) {
		if (!this.state.dragging) return;
		const next = {
			x: e.clientX - this.state.rel.x,
			y: e.clientY - this.state.rel.y,
		};
		const pos = this.props.snapWhileDragging ? this.snapToClosest(next) : this.clampToViewport(next);
		this.setState({ pos });
		e.stopPropagation();
		e.preventDefault();
	}

	onMouseUp(e) {
		if (!this.state.dragging) return;
		const snapped = this.snapToClosest(this.state.pos);
		this.setState({ dragging: false, pos: snapped });
		e.stopPropagation();
		e.preventDefault();
	}

	// Touch support
	onTouchStart(e) {
		const t = e.touches[0];
		if (!t) return;
		const node = this.nodeRef.current;
		if (!node) return;
		const rect = node.getBoundingClientRect();
		this.setState({
			dragging: true,
			rel: { x: t.clientX - rect.left, y: t.clientY - rect.top },
		});
		e.stopPropagation();
	}
	onTouchMove(e) {
		if (!this.state.dragging) return;
		const t = e.touches[0];
		if (!t) return;
		const next = {
			x: t.clientX - this.state.rel.x,
			y: t.clientY - this.state.rel.y,
		};
		const pos = this.props.snapWhileDragging ? this.snapToClosest(next) : this.clampToViewport(next);
		this.setState({ pos });
		e.preventDefault();
	}
	onTouchEnd(e) {
		if (!this.state.dragging) return;
		const snapped = this.snapToClosest(this.state.pos);
		this.setState({ dragging: false, pos: snapped });
	}

	handleResize() {
		// keep it in-bounds after viewport changes
		this.setState((s) => ({ pos: this.clampToViewport(s.pos) }));
	}

	render() {
		const {
			style,
			className,
			children,
			initialPos, // strip custom props
			snap,
			snapThreshold,
			snapWhileDragging,
			snapPadding,
			snapAnchors,
			zIndex,
			...rest
		} = this.props;

		const mergedStyle = {
			position: "fixed", // <-- overlay over whole site
			left: `${this.state.pos.x}px`,
			top: `${this.state.pos.y}px`,
			cursor: this.state.dragging ? "grabbing" : "grab",
			touchAction: "none",
			zIndex,
			// avoid accidental text selection while dragging
			WebkitUserSelect: "none",
			userSelect: "none",
			// smoother dragging
			willChange: "transform, left, top",
			...style,
		};

		return (
			<div
				ref={this.nodeRef}
				onMouseDown={this.onMouseDown}
				onTouchStart={this.onTouchStart}
				style={mergedStyle}
				className={className}
				data-testid="draggable-overlay"
				{...rest}>
				{children}
			</div>
		);
	}
}

// ----- OVERLAY (functional) -----
const DraggableCallOverlay = ({ open = true, onClose }) => {
	const theme = useTheme();
	if (!open) return null;

	const content = (
		<Draggable
			initialPos={{ x: 24, y: 24 }}
			snap
			snapThreshold={64}
			snapPadding={16}
			// choose the anchors you want (example: left side + top/center/bottom + top center)
			snapAnchors={["top-left", "left", "bottom-left", "top", "center"]}
			snapWhileDragging={false}
			// zIndex above MUI modals to be safe
			zIndex={(theme?.zIndex?.modal ?? 1300) + 2}>
			<Paper
				elevation={8}
				data-testid="call-overlay"
				sx={{
					p: 2,
					minWidth: 220,
					maxWidth: 320,
					borderRadius: 2,
					display: "flex",
					flexDirection: "column",
					gap: 1,
				}}>
				<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
					<Stack direction="row" spacing={1} alignItems="center">
						<PhoneIcon fontSize="small" />
						<Typography variant="subtitle1" fontWeight={600}>
							Contact / Call Info
						</Typography>
					</Stack>
					{onClose && (
						<IconButton size="small" onClick={onClose} aria-label="Close overlay" data-testid="call-overlay-close-button">
							<CloseIcon fontSize="small" />
						</IconButton>
					)}
				</Stack>

				<Stack spacing={0.25}>
					<Typography variant="body2">
						<strong>Discord:</strong> BrandonCasa#1234
					</Typography>
					{/* Replace these with your real handles */}
					<Typography variant="body2">
						<strong>Telegram:</strong> @brandoncasa
					</Typography>
					<Typography variant="body2">
						<strong>Email:</strong> <Link href="mailto:brandon@example.com">brandon@example.com</Link>
					</Typography>
				</Stack>

				<Typography variant="caption" color="text.secondary">
					Drag to snap (corners / edges / center). Stays above the page and won’t shift layout.
				</Typography>
			</Paper>
		</Draggable>
	);

	// Portal to body so it never participates in page layout and avoids parent stacking/overflow traps
	return ReactDOM.createPortal(content, document.body);
};

export default DraggableCallOverlay;
