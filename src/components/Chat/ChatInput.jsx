import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { styled, useTheme, darken } from "@mui/material/styles";
import { Box, Chip, Typography, Paper } from "@mui/material";
import Button from "@mui/material/Button";
import SendIcon from "@mui/icons-material/Send";
import DOMPurify from "dompurify";
import { parseMentions, highlightMentions } from "../../helpers/mentions";

// --- Styled components ----------------------------------------------------
const ChatForm = styled("form")(({ theme }) => ({
	display: "flex",
	alignItems: "flex-end",
	gap: theme.spacing(1),
	padding: theme.spacing(1),
}));

const EditableDiv = styled("div")(({ theme }) => ({
	flex: 1,
	minHeight: 16,
	maxHeight: 180,
	overflowY: "auto",
	alignContent: "center",
	padding: theme.spacing(1, 1),
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
		display: "inline-flex",
		alignItems: "center",
		padding: "0 4px",
		borderRadius: 16,
		backgroundColor: theme.palette.warning.main,
		":hover": {
			cursor: "pointer",
			backgroundColor: theme.palette.warning.dark,
		},
		color: theme.palette.primary.contrastText,
		fontSize: "0.75rem",
		lineHeight: "22px",
		margin: "0 2px",
	},
}));

// --- Utility helpers ------------------------------------------------------
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const getMentionQuery = (text = "", caret = 0) => {
	const beforeCaret = text.slice(0, caret);
	const lastAt = beforeCaret.lastIndexOf("@");
	if (lastAt === -1) return null;

	const charBefore = beforeCaret[lastAt - 1];
	if (charBefore && !/\s/.test(charBefore)) return null;

	const query = beforeCaret.slice(lastAt + 1);
	if (query.includes("\n")) return null;

	return query;
};

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
const buildHighlightedHtml = (text, mentions) => {
	if (!text) return "";
	const parts = highlightMentions(text, mentions);
	const raw = parts.map((p) => (p.mention ? `<span class="mention">${escapeHtml(p.text)}</span>` : escapeHtml(p.text))).join("");
	return DOMPurify.sanitize(raw);
};

export default function ChatInput({ message, setMessage, sendMessage, users = [] }) {
	const theme = useTheme();
	const divRef = useRef(null);
	const [mentionQuery, setMentionQuery] = useState(null);
	const [activeMentionIdx, setActiveMentionIdx] = useState(0);

	// Pre‑compute mentions + highlighted markup -----------------------------
	const mentions = useMemo(() => parseMentions(message, users), [message, users]);

	const highlightedHTML = useMemo(() => buildHighlightedHtml(message, mentions), [message, mentions]);

	const mentionOptions = useMemo(() => {
		if (mentionQuery === null) return [];

		const normalizedQuery = mentionQuery.toLowerCase();
		return users
			.filter((u) => u?.displayName)
			.sort((a, b) => a.displayName.localeCompare(b.displayName))
			.filter((u) => (normalizedQuery ? u.displayName.toLowerCase().includes(normalizedQuery) : true))
			.slice(0, 5);
	}, [mentionQuery, users]);

	useEffect(() => {
		if (!message) {
			setMentionQuery(null);
			setActiveMentionIdx(0);
		}
	}, [message]);

	useEffect(() => {
		setActiveMentionIdx((idx) => (mentionOptions.length ? Math.min(idx, mentionOptions.length - 1) : 0));
	}, [mentionOptions.length]);

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
	const syncFromDom = useCallback(
		(resetActiveMention = false) => {
			const el = divRef.current;
			if (!el) return;
			const caret = getCaretCharacterOffsetWithin(el);
			const text = el.textContent || "";
			setMessage(text);
			setMentionQuery(getMentionQuery(text, caret));
			if (resetActiveMention) setActiveMentionIdx(0);
		},
		[setMessage]
	);

	const handleInput = useCallback(() => {
		syncFromDom(true);
	}, [syncFromDom]);

	const handlePaste = (e) => {
		e.preventDefault();
		const text = e.clipboardData.getData("text/plain");
		document.execCommand("insertText", false, text); // execCommand is safe for plain text insertion here.
		requestAnimationFrame(() => syncFromDom(true));
	};

	const applyMentionCompletion = useCallback(
		(user) => {
			if (!user?.displayName) return;
			const el = divRef.current;
			if (!el) return;

			const currentText = el.textContent || "";
			const caret = getCaretCharacterOffsetWithin(el);
			const beforeCaret = currentText.slice(0, caret);
			const atIndex = beforeCaret.lastIndexOf("@");

			if (atIndex === -1) return;

			const before = currentText.slice(0, atIndex + 1);
			const after = currentText.slice(caret);
			const withMention = `${before}${user.displayName} `;
			const mergedText = `${withMention}${after}`;
			const mergedMentions = parseMentions(mergedText, users);
			const nextHTML = buildHighlightedHtml(mergedText, mergedMentions);

			setMessage(mergedText);
			setMentionQuery(null);
			setActiveMentionIdx(0);

			requestAnimationFrame(() => {
				if (!divRef.current) return;
				divRef.current.innerHTML = nextHTML;
				setCaretPosition(divRef.current, withMention.length);
			});
		},
		[setMessage, users]
	);

	const handleSend = useCallback(() => {
		const trimmed = divRef.current?.textContent.trim();
		if (trimmed) {
			sendMessage();
			setMessage("");
			setMentionQuery(null);
			setActiveMentionIdx(0);
			requestAnimationFrame(() => {
				if (divRef.current) divRef.current.innerHTML = "";
			});
		}
	}, [sendMessage, setMessage]);

	const handleKeyDown = (e) => {
		if (mentionOptions.length) {
			if (e.key === "Tab") {
				e.preventDefault();
				applyMentionCompletion(mentionOptions[activeMentionIdx]);
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setActiveMentionIdx((idx) => (idx + 1) % mentionOptions.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setActiveMentionIdx((idx) => (idx - 1 + mentionOptions.length) % mentionOptions.length);
				return;
			}
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleSelectionChange = useCallback(() => {
		syncFromDom(false);
	}, [syncFromDom]);

	return (
		<Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 0.5 }}>
			{mentionOptions.length > 0 && (
				<Box
					aria-live="polite"
					sx={{
						display: "flex",
						flexWrap: "wrap",
						alignItems: "center",
						gap: 0.5,
						px: 2,
						py: 1,
						mx: 1,
						mb: -0.5,
						border: `2px solid ${theme.palette.divider}`,
						backgroundColor: `${darken(theme.palette.background.paper, 0.05)}`,
						borderRadius: 2,
						overflowX: "auto",
						":hover": {
							backgroundColor: `${darken(theme.palette.background.paper, 0.125)}`,
						},
					}}>
					<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, pr: 1 }}>
						Mention:
					</Typography>
					{mentionOptions.map((u, idx) => (
						<Chip
							key={u.id || u._id || u.displayName}
							label={`@${escapeHtml(u.displayName)}`}
							size="small"
							sx={{
								backgroundColor: theme.palette.warning.main,
								":hover": {
									cursor: "pointer",
									backgroundColor: theme.palette.warning.dark,
								},
							}}
							onMouseDown={(evt) => {
								evt.preventDefault();
								applyMentionCompletion(u);
							}}
							onClick={(evt) => {
								evt.preventDefault();
								applyMentionCompletion(u);
							}}
						/>
					))}
				</Box>
			)}
			<ChatForm onSubmit={(e) => e.preventDefault()}>
				<EditableDiv
					ref={divRef}
					contentEditable
					suppressContentEditableWarning
					spellCheck={false}
					onInput={handleInput}
					onPaste={handlePaste}
					onKeyDown={handleKeyDown}
					onKeyUp={handleSelectionChange}
					onMouseUp={handleSelectionChange}
					onFocus={handleSelectionChange}
					aria-label="Chat message input"
				/>
				<Button type="button" variant="contained" endIcon={<SendIcon />} sx={{ height: 42 }} onClick={handleSend}>
					Send
				</Button>
			</ChatForm>
		</Box>
	);
}
