import React, { useRef, useEffect, useMemo, useCallback } from "react";
import { styled, useTheme } from "@mui/material/styles";
import Button from "@mui/material/Button";
import SendIcon from "@mui/icons-material/Send";
import DOMPurify from "dompurify";
import { parseMentions, highlightMentions } from "../../helpers/mentions";

/** -------------------------------------------------------------------------
 *  Redesigned ChatInput
 *  ------------------------------------------------------------------------
 *  Key goals:
 *   • **No overlay/layer trickery** – a single `contentEditable` element is the
 *     source of truth. This fixes selection, copy‑paste and accessibility woes.
 *   • **Shift+Enter → new line**, bare Enter → submit.
 *   • Mentions (`@username`) are highlighted on‑the‑fly by rewriting the inner
 *     HTML. DOMPurify keeps the content safe.
 *   • Uses only React hooks + MUI `styled`, no external rich‑text libs.
 * ------------------------------------------------------------------------*/

// --- Styled components ----------------------------------------------------
const ChatForm = styled("form")(({ theme }) => ({
	display: "flex",
	alignItems: "flex-end",
	gap: theme.spacing(1),
	padding: theme.spacing(1),
}));

const EditableDiv = styled("div")(({ theme }) => ({
	flex: 1,
	minHeight: 42,
	maxHeight: 180,
	overflowY: "auto",
	padding: theme.spacing(1),
	border: `1px solid ${theme.palette.primary.main}`,
	borderRadius: theme.shape.borderRadius,
	outline: "none",
	font: "inherit",
	whiteSpace: "pre-wrap",
	wordBreak: "break-word",
	// placeholder
	"&:empty:before": {
		content: '"Type your message"',
		color: theme.palette.text.secondary,
		cursor: "text",
	},
	// mention highlight
	"& .mention": {
		backgroundColor: theme.palette.warning.main,
		color: theme.palette.common.white,
		borderRadius: 2,
		padding: "0 2px",
	},
}));

// --- Utility helpers ------------------------------------------------------
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Save cursor position (offset from the start of the editable). */
function getCaretCharacterOffsetWithin(element) {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return 0;
	const range = selection.getRangeAt(0);
	const preCaretRange = range.cloneRange();
	preCaretRange.selectNodeContents(element);
	preCaretRange.setEnd(range.endContainer, range.endOffset);
	return preCaretRange.toString().length;
}

/** Restore cursor to a given character offset. */
function setCaretPosition(element, offset) {
	const selection = window.getSelection();
	if (!selection) return;
	let current = 0;
	const nodeIterator = document.createNodeIterator(element, NodeFilter.SHOW_TEXT, null);
	let node;
	while ((node = nodeIterator.nextNode())) {
		const next = current + node.textContent.length;
		if (offset <= next) {
			const range = document.createRange();
			range.setStart(node, offset - current);
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
			return;
		}
		current = next;
	}
	// Fallback: set to end
	selection.selectAllChildren(element);
	selection.collapseToEnd();
}

// --- Component ------------------------------------------------------------
export default function ChatInput({ message, setMessage, sendMessage, users = [] }) {
	const theme = useTheme();
	const divRef = useRef(null);

	// Pre‑compute mentions + highlighted markup -----------------------------
	const mentions = useMemo(() => parseMentions(message, users), [message, users]);

	const highlightedHTML = useMemo(() => {
		if (!message) return "";
		const parts = highlightMentions(message, mentions);
		const raw = parts.map((p) => (p.mention ? `<span class="mention">${escapeHtml(p.text)}</span>` : escapeHtml(p.text))).join("");
		return DOMPurify.sanitize(raw);
	}, [message, mentions]);

	// Keep DOM in sync when `message` changes (e.g. external clear) ---------
	useEffect(() => {
		const el = divRef.current;
		if (!el) return;
		// Skip if content already up‑to‑date
		if (el.innerHTML === highlightedHTML) return;

		const caretPos = getCaretCharacterOffsetWithin(el);
		el.innerHTML = highlightedHTML;
		setCaretPosition(el, caretPos);
	}, [highlightedHTML]);

	// Handle input events ----------------------------------------------------
	const updatePlainText = useCallback(() => {
		const el = divRef.current;
		if (!el) return;
		// textContent drops the markup – perfect for state
		setMessage(el.textContent);
	}, [setMessage]);

	const handleInput = useCallback(() => {
		updatePlainText();
	}, [updatePlainText]);

	const handlePaste = (e) => {
		e.preventDefault();
		const text = e.clipboardData.getData("text/plain");
		document.execCommand("insertText", false, text); // execCommand is safe for plain text insertion here.
	};

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const trimmed = divRef.current?.textContent.trim();
			if (trimmed) {
				sendMessage();
				setMessage("");
				// Clear editable
				requestAnimationFrame(() => {
					if (divRef.current) divRef.current.innerHTML = "";
				});
			}
		}
	};

	return (
		<ChatForm onSubmit={(e) => e.preventDefault()}>
			<EditableDiv
				ref={divRef}
				contentEditable
				suppressContentEditableWarning
				spellCheck={false}
				onInput={handleInput}
				onPaste={handlePaste}
				onKeyDown={handleKeyDown}
				aria-label="Chat message input"
			/>
			<Button
				type="button"
				variant="contained"
				endIcon={<SendIcon />}
				sx={{ height: 42 }}
				onClick={() => {
					const trimmed = divRef.current?.textContent.trim();
					if (trimmed) {
						sendMessage();
						setMessage("");
						requestAnimationFrame(() => {
							if (divRef.current) divRef.current.innerHTML = "";
						});
					}
				}}>
				Send
			</Button>
		</ChatForm>
	);
}
