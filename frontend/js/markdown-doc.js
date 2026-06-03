const article = document.getElementById("docArticle");
const toc = document.getElementById("docToc");
const SOURCE = "/docs/fsr_hardware_classes.md";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableStart(lines, index) {
  return lines[index]?.includes("|") && isTableSeparator(lines[index + 1] || "");
}

function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines, start) {
  const header = tableCells(lines[start]);
  let index = start + 2;
  const rows = [];
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    rows.push(tableCells(lines[index]));
    index += 1;
  }
  const head = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return { html: `<div class="doc-table-wrap"><table>${head}${body}</table></div>`, next: index };
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  const headings = [];
  let index = 0;
  let listType = null;

  function closeList() {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```(\w+)?/);
    if (fence) {
      closeList();
      const language = fence[1] || "text";
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      output.push(
        `<pre class="doc-code ${language === "mermaid" ? "doc-mermaid" : ""}"><code>${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (isTableStart(lines, index)) {
      closeList();
      const table = renderTable(lines, index);
      output.push(table.html);
      index = table.next;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2].replace(/`/g, "");
      const id = slugify(text);
      headings.push({ level, text, id });
      output.push(`<h${level} id="${id}">${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const unordered = trimmed.match(/^-\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        output.push("<ul>");
      }
      output.push(`<li>${renderInline(unordered[1])}</li>`);
      index += 1;
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        output.push("<ol>");
      }
      output.push(`<li>${renderInline(ordered[1])}</li>`);
      index += 1;
      continue;
    }

    closeList();
    output.push(`<p>${renderInline(trimmed)}</p>`);
    index += 1;
  }

  closeList();
  return { html: output.join("\n"), headings };
}

function renderToc(headings) {
  if (!toc) return;
  toc.innerHTML = headings
    .filter((heading) => heading.level <= 2)
    .map((heading) => `<a class="toc-level-${heading.level}" href="#${heading.id}">${escapeHtml(heading.text)}</a>`)
    .join("");
}

async function loadDocument() {
  try {
    const response = await fetch(SOURCE);
    if (!response.ok) throw new Error(`Unable to load ${SOURCE}: ${response.status}`);
    const markdown = await response.text();
    const rendered = renderMarkdown(markdown);
    article.innerHTML = rendered.html;
    renderToc(rendered.headings);
  } catch (error) {
    article.innerHTML = `<p class="doc-error">${escapeHtml(error.message)}</p>`;
  }
}

loadDocument();
