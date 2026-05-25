import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { escapeHtml } from "../utils/escapeHtml.js";

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "html_css");
const passwordResetHtmlTemplate = fs.readFileSync(path.join(templateDir, "password_reset.html"), "utf8");
const passwordResetCss = fs.readFileSync(path.join(templateDir, "password_reset.css"), "utf8");

const renderPasswordResetEmail = ({ resetUrl, year }) => {
	const safeResetUrl = escapeHtml(resetUrl);
	const safeYear = escapeHtml(year);

	return passwordResetHtmlTemplate.replace("{{EMAIL_CSS}}", passwordResetCss).replaceAll("{{RESET_URL}}", safeResetUrl).replace("{{YEAR}}", safeYear);
};

export { renderPasswordResetEmail };
