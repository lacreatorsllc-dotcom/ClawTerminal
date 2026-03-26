-- ClawTerminal: Anthropic Official Skills Catalog
-- Source: https://github.com/anthropics/skills
-- Run after 001_schema.sql and skills.sql
-- Uses ON CONFLICT DO NOTHING to be safe to re-run

insert into public.skills (name, description, category, version, config_schema) values

(
  'Algorithmic Art',
  'Generate computational art using p5.js with seeded randomness. Creates interactive artworks from algorithmic philosophies — emergent behavior, mathematical beauty, and real-time parameter exploration.',
  'Creative',
  '1.0.0',
  '{"fields": []}'
),

(
  'Brand Guidelines',
  'Apply Anthropic brand identity to designs — Poppins/Lora typography, official color palette, and smart accent color cycling. Post-processing tool for brand-consistent visual output.',
  'Design',
  '1.0.0',
  '{"fields": []}'
),

(
  'Canvas Design',
  'Create museum-quality visual art as PDF or PNG. Translates a design philosophy into a single-page masterpiece — 90% visual, 10% essential text. Spatial communication over decorated documents.',
  'Creative',
  '1.0.0',
  '{"fields": []}'
),

(
  'Claude API',
  'Build LLM-powered applications with the Claude API across Python, TypeScript, Java, Go, Ruby, C#, and PHP. Covers streaming, tool use, agents, batches, files, and caching with correct defaults for all models.',
  'Development',
  '1.0.0',
  '{"fields": [
    { "key": "language", "label": "Project Language", "type": "select", "required": false, "options": ["python", "typescript", "java", "go", "ruby", "csharp", "php"], "default": "typescript" }
  ]}'
),

(
  'Doc Co-Authoring',
  'Collaborative document creation through structured context gathering, section-by-section refinement, and reader testing. Ensures documents answer reader questions before they reach them.',
  'Productivity',
  '1.0.0',
  '{"fields": []}'
),

(
  'DOCX',
  'Create and edit Word documents (.docx). Handles XML-level manipulation, tracked changes, tables, images, page layout, and headers/footers via pandoc and docx-js.',
  'Documents',
  '1.0.0',
  '{"fields": []}'
),

(
  'Frontend Design',
  'Create distinctive, production-grade frontend interfaces. Emphasizes intentional typography, cohesive color strategy, micro-interactions, and unconventional spatial composition over generic AI aesthetics.',
  'Development',
  '1.0.0',
  '{"fields": []}'
),

(
  'Internal Comms',
  'Write professional internal communications — 3P updates (Progress/Plans/Problems), newsletters, FAQ responses, status reports, leadership updates, incident reports, and project updates.',
  'Communication',
  '1.0.0',
  '{"fields": [
    { "key": "format", "label": "Communication Format", "type": "select", "required": false, "options": ["3p-update", "newsletter", "faq", "status-report", "leadership-update", "incident-report", "project-update"], "default": "3p-update" }
  ]}'
),

(
  'MCP Builder',
  'Build high-quality MCP (Model Context Protocol) servers. Covers research, TypeScript/Python implementation, tool design, error handling, pagination, and evaluation generation.',
  'Development',
  '1.0.0',
  '{"fields": [
    { "key": "language", "label": "Language", "type": "select", "required": false, "options": ["typescript", "python"], "default": "typescript" }
  ]}'
),

(
  'PDF',
  'Read, create, edit, and manipulate PDF files. Covers text/table extraction, merging, splitting, rotating, OCR, watermarking, encryption, and image extraction via pypdf, pdfplumber, reportlab, and poppler.',
  'Documents',
  '1.0.0',
  '{"fields": []}'
),

(
  'PPTX',
  'Create and edit PowerPoint presentations. Covers design standards, color strategy, typography pairing, layout variety, and QA process to catch placeholder text, overlaps, and poor contrast.',
  'Documents',
  '1.0.0',
  '{"fields": []}'
),

(
  'Skill Creator',
  'Design, test, and improve Claude skills. Iterative workflow: capture intent, interview, write SKILL.md, run parallel test cases, grade with assertions, and refine without overfitting.',
  'Development',
  '1.0.0',
  '{"fields": []}'
),

(
  'Slack GIF Creator',
  'Create animated GIFs optimized for Slack. Supports 8 animation patterns (shake, pulse, bounce, spin, fade, slide, zoom, explode) with PIL primitives. Outputs 128x128 emoji or 480x480 message GIFs.',
  'Creative',
  '1.0.0',
  '{"fields": [
    { "key": "type", "label": "GIF Type", "type": "select", "required": false, "options": ["emoji", "message"], "default": "emoji" }
  ]}'
),

(
  'Theme Factory',
  'Apply professional design themes to artifacts. 10 pre-set themes (Ocean Depths, Sunset Boulevard, Forest Canopy, Modern Minimalist, etc.) or generate custom themes from preferences.',
  'Design',
  '1.0.0',
  '{"fields": [
    { "key": "theme", "label": "Theme", "type": "select", "required": false, "options": ["ocean-depths", "sunset-boulevard", "forest-canopy", "modern-minimalist", "golden-hour", "arctic-frost", "desert-rose", "tech-innovation", "botanical-garden", "midnight-galaxy", "custom"], "default": "modern-minimalist" }
  ]}'
),

(
  'Web Artifacts Builder',
  'Build sophisticated HTML artifacts using React 18, TypeScript, Vite, Tailwind CSS, and shadcn/ui. Bundles into a single self-contained HTML file. 40+ pre-installed components.',
  'Development',
  '1.0.0',
  '{"fields": []}'
),

(
  'Webapp Testing',
  'Test local web applications with Python Playwright. Handles static and dynamic apps, waits for JS execution, manages server lifecycle, and supports multi-server concurrent testing.',
  'Development',
  '1.0.0',
  '{"fields": [
    { "key": "app_url", "label": "App URL", "type": "string", "required": false, "default": "http://localhost:3000", "hint": "URL of the running web app to test" }
  ]}'
),

(
  'XLSX',
  'Create and edit Excel spreadsheets (.xlsx). Enforces financial model color coding, number formatting standards, and formula-based calculations — never hardcoded Python values.',
  'Documents',
  '1.0.0',
  '{"fields": []}'
);
