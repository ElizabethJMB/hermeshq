from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path


DEFAULT_CSS = """
@page {
    size: A4;
    margin: 2cm;
    @bottom-center {
        content: counter(page) " / " counter(pages);
        font-size: 9px;
        color: #999;
    }
}
body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #333;
}
h1 {
    font-size: 22pt;
    color: #1a1a2e;
    border-bottom: 3px solid #0f3460;
    padding-bottom: 8px;
    margin-bottom: 16px;
}
h2 {
    font-size: 16pt;
    color: #16213e;
    margin-top: 24px;
}
h3 {
    font-size: 13pt;
    color: #0f3460;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
}
th, td {
    border: 1px solid #ddd;
    padding: 8px 12px;
    text-align: left;
}
th {
    background-color: #0f3460;
    color: white;
    font-weight: bold;
}
tr:nth-child(even) {
    background-color: #f8f9fa;
}
blockquote {
    border-left: 4px solid #0f3460;
    margin: 12px 0;
    padding: 8px 16px;
    background-color: #f0f4ff;
    color: #555;
}
code {
    background-color: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 10pt;
}
.footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    font-size: 9pt;
    color: #999;
    text-align: center;
}
"""


def _check_requirements():
    import warnings
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            import weasyprint  # noqa: F401
        return True
    except ImportError:
        return False


def _handle_generate_pdf(args, **_kwargs):
    title = args.get("title", "Documento")
    html_content = args.get("html_content", "")
    css_content = args.get("css_content", "")
    filename = args.get("filename", "")

    import warnings
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from weasyprint import HTML, CSS
    except ImportError:
        return json.dumps({
            "success": False,
            "error": "weasyprint is not installed. PDF generation is unavailable."
        })

    if not filename:
        safe_title = "".join(c if c.isalnum() or c in ("-_",) else "-" for c in title.lower())[:60]
        filename = f"{safe_title}.pdf"

    work_dir = Path(os.environ.get("HERMES_SESSION_CWD", os.getcwd()))
    output_dir = work_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    filepath = output_dir / filename

    full_html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
</head>
<body>
    <h1>{title}</h1>
    {html_content}
    <div class="footer">
        Generado el {datetime.now().strftime("%d/%m/%Y %H:%M")} por HermesHQ
    </div>
</body>
</html>"""

    combined_css = css_content if css_content.strip() else DEFAULT_CSS

    try:
        HTML(string=full_html).write_pdf(str(filepath), stylesheets=[CSS(string=combined_css)])
    except Exception as exc:
        return json.dumps({"success": False, "error": f"PDF generation failed: {exc}"})

    return json.dumps({
        "success": True,
        "filename": filename,
        "path": str(filepath),
        "size_bytes": filepath.stat().st_size,
    })


def register(ctx):
    specs = [
        {
            "name": "hq_pdf_generate",
            "description": (
                "Generate a professional PDF document from HTML content. "
                "Supports headings, paragraphs, tables, lists, images, blockquotes, and custom CSS styling. "
                "The PDF is saved to the agent's output directory and can be attached to messages."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Document title (shown as h1 heading and in metadata)",
                    },
                    "html_content": {
                        "type": "string",
                        "description": "HTML body content (without html/head/body tags). Supports h1-h6, p, table, ul, ol, blockquote, code, img, strong, em, etc.",
                    },
                    "css_content": {
                        "type": "string",
                        "description": "Optional custom CSS to override default styling. If omitted, professional default styling is applied.",
                    },
                    "filename": {
                        "type": "string",
                        "description": "Optional output filename (e.g. 'report.pdf'). If omitted, derived from title.",
                    },
                },
                "required": ["title", "html_content"],
            },
            "handler": _handle_generate_pdf,
            "emoji": "📄",
        },
    ]

    for spec in specs:
        ctx.register_tool(
            name=spec["name"],
            toolset="hermeshq_pdf",
            schema={
                "name": spec["name"],
                "description": spec["description"],
                "parameters": spec["parameters"],
            },
            handler=spec["handler"],
            check_fn=_check_requirements,
            description=spec["description"],
            emoji=spec["emoji"],
        )
