/* /js/util/markdown.util.js
 * - 경량 마크다운 렌더러(안전 우선)
 * - 지원:
 *   - 코드 펜스 ```lang ... ```
 *   - 인라인 코드 `code`
 *   - 헤딩: # ~ ######
 *   - 굵게: **bold**
 *   - 구분선: --- / ***
 *   - 리스트: - item / * item
 *   - 테이블: | a | b | (헤더 구분선 포함)
 * - NOTE:
 *   - HTML 입력은 모두 escape → XSS 방지
 */

export const MARKDOWN_UTIL_VERSION = "aiqoo-md:v3-2026-02-13";

console.log("[AIQOO] markdown.util.js loaded:", MARKDOWN_UTIL_VERSION);

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(textEscaped = "") {
  let t = String(textEscaped);

  // 인라인 코드 `...`
  t = t.replace(/`([^`]+?)`/g, (_, code) => {
    return `<code class="md-inline-code">${escapeHtml(code)}</code>`;
  });

  // 굵게 **...**
  t = t.replace(/\*\*([^*]+?)\*\*/g, (_, bold) => {
    return `<strong class="md-strong">${escapeHtml(bold)}</strong>`;
  });

  return t;
}

function isHrLine(line) {
  const s = line.trim();
  return s === "---" || s === "***" || /^-{3,}$/.test(s) || /^\*{3,}$/.test(s);
}

function isHeading(line) {
  return /^#{1,6}\s+/.test(line);
}

function parseHeading(lineEscaped) {
  const raw = String(lineEscaped);
  const m = raw.match(/^(#{1,6})\s+(.*)$/);
  if (!m) return null;
  const level = m[1].length;
  const content = m[2] ?? "";
  return `<h${level} class="md-h md-h${level}">${renderInline(content)}</h${level}>`;
}

function isListItem(line) {
  return /^\s*[-*]\s+/.test(line);
}

function parseList(linesEscaped, startIdx) {
  const items = [];
  let i = startIdx;

  while (i < linesEscaped.length) {
    const line = linesEscaped[i];
    if (!isListItem(line)) break;

    const liText = line.replace(/^\s*[-*]\s+/, "");
    items.push(`<li class="md-li">${renderInline(liText)}</li>`);
    i++;
  }

  if (!items.length) return null;
  return { html: `<ul class="md-ul">${items.join("")}</ul>`, nextIdx: i };
}

function looksLikeTableRow(line) {
  const s = line.trim();
  return s.includes("|") && s.replaceAll("|", "").trim().length > 0;
}

function isTableSeparator(line) {
  const s = line.trim();
  if (!s.includes("-")) return false;
  const x = s.replaceAll("|", "").trim();
  return /^[\s:-]+$/.test(x) && x.includes("-");
}

function splitTableCells(lineEscaped) {
  const s = lineEscaped.trim();
  const trimmed = s.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function parseTable(linesEscaped, startIdx) {
  if (startIdx + 1 >= linesEscaped.length) return null;

  const headerLine = linesEscaped[startIdx];
  const sepLine = linesEscaped[startIdx + 1];

  if (!looksLikeTableRow(headerLine) || !isTableSeparator(sepLine)) return null;

  const headers = splitTableCells(headerLine).map(
    (h) => `<th class="md-th">${renderInline(h)}</th>`
  );

  const rows = [];
  let i = startIdx + 2;

  while (i < linesEscaped.length) {
    const line = linesEscaped[i];
    if (!looksLikeTableRow(line) || isHrLine(line) || isHeading(line) || isListItem(line)) break;

    const cells = splitTableCells(line).map(
      (c) => `<td class="md-td">${renderInline(c)}</td>`
    );
    rows.push(`<tr class="md-tr">${cells.join("")}</tr>`);
    i++;
  }

  const html = `
    <div class="md-table-wrap">
      <table class="md-table">
        <thead class="md-thead"><tr class="md-tr">${headers.join("")}</tr></thead>
        <tbody class="md-tbody">${rows.join("")}</tbody>
      </table>
    </div>
  `;

  return { html, nextIdx: i };
}

function renderTextBlocks(textRaw = "") {
  const src = String(textRaw ?? "");
  if (!src) return "";

  const escapedWhole = escapeHtml(src);
  const lines = escapedWhole.split("\n");

  let out = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (isHrLine(line)) {
      out += `<hr class="md-hr">`;
      i++;
      continue;
    }

    if (isHeading(line)) {
      const h = parseHeading(line);
      if (h) out += h;
      i++;
      continue;
    }

    const tableParsed = parseTable(lines, i);
    if (tableParsed) {
      out += tableParsed.html;
      i = tableParsed.nextIdx;
      continue;
    }

    if (isListItem(line)) {
      const listParsed = parseList(lines, i);
      if (listParsed) {
        out += listParsed.html;
        i = listParsed.nextIdx;
        continue;
      }
    }

    // 문단(블록 요소 전까지 <br>로 묶기)
    const paraLines = [];
    let j = i;
    while (j < lines.length) {
      const l = lines[j];
      if (!l.trim()) break;
      if (isHrLine(l) || isHeading(l) || isListItem(l)) break;
      if (parseTable(lines, j)) break;
      paraLines.push(l);
      j++;
    }

    out += `<div class="md-text">${renderInline(paraLines.join("<br>"))}</div>`;
    i = j;
  }

  return out;
}

/**
 * @param {string} md
 * @returns {string} safe HTML string
 */
export function renderMarkdownSafe(md = "") {
  const src = String(md ?? "");
  const fenceRegex = /```(\w+)?\n([\s\S]*?)```/g;

  let out = `<!-- ${MARKDOWN_UTIL_VERSION} -->`;
  let lastIdx = 0;
  let match;

  while ((match = fenceRegex.exec(src)) !== null) {
    const [full, lang, codeBody] = match;
    const start = match.index;
    const end = start + full.length;

    out += renderTextBlocks(src.slice(lastIdx, start));

    const language = lang ? escapeHtml(lang) : "";
    const codeEscaped = escapeHtml(codeBody);

    out += `
      <div class="md-codeblock">
        <div class="md-codebar">
          <span class="md-lang">${language || "code"}</span>
          <button class="md-copy-btn" type="button" data-copy="${escapeHtml(codeBody)}">복사</button>
        </div>
        <pre class="md-pre"><code class="md-code">${codeEscaped}</code></pre>
      </div>
    `;

    lastIdx = end;
  }

  out += renderTextBlocks(src.slice(lastIdx));
  return out.trim();
}

export function bindMarkdownCopyButtons(root) {
  if (!root) return;

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest(".md-copy-btn");
    if (!btn) return;

    const raw = btn.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(raw);
      const old = btn.textContent;
      btn.textContent = "복사됨";
      setTimeout(() => (btn.textContent = old), 900);
    } catch (err) {
      console.error("Clipboard error:", err);
      btn.textContent = "실패";
      setTimeout(() => (btn.textContent = "복사"), 900);
    }
  });
}
