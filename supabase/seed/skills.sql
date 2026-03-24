-- ClawTerminal: Skill Catalog Seed Data (v1)
-- 10 curated skills — run after migrations
-- config_schema describes the fields a user would configure when assigning the skill

insert into public.skills (name, description, category, version, config_schema) values

(
  'Web Search',
  'Let your agent search the web for real-time information. Queries are sent to a search API and results are returned as structured context.',
  'Information',
  '1.0.0',
  '{
    "fields": [
      { "key": "api_key", "label": "Search API Key", "type": "secret", "required": true, "hint": "Your Brave Search or Serper API key" },
      { "key": "max_results", "label": "Max Results Per Query", "type": "number", "required": false, "default": 5 }
    ]
  }'
),

(
  'Code Executor',
  'Run Python or JavaScript code snippets in a sandboxed environment. Agent can test logic, process data, or validate outputs without leaving the conversation.',
  'Development',
  '1.0.0',
  '{
    "fields": [
      { "key": "language", "label": "Language", "type": "select", "required": true, "options": ["python", "javascript"], "default": "python" },
      { "key": "timeout_seconds", "label": "Execution Timeout (seconds)", "type": "number", "required": false, "default": 10 }
    ]
  }'
),

(
  'File Reader',
  'Allow your agent to read files from a specified directory on the host system. Useful for agents that process documents, logs, or local data.',
  'Data',
  '1.0.0',
  '{
    "fields": [
      { "key": "allowed_path", "label": "Allowed Directory Path", "type": "string", "required": true, "hint": "Absolute path the agent is allowed to read from (e.g. /home/user/docs)" },
      { "key": "allowed_extensions", "label": "Allowed File Extensions", "type": "string", "required": false, "default": ".txt,.md,.json,.csv", "hint": "Comma-separated list" }
    ]
  }'
),

(
  'GitHub',
  'Connect your agent to GitHub. Read and create issues, pull requests, and commits. Automate code review notes or task tracking directly from agent output.',
  'Development',
  '1.0.0',
  '{
    "fields": [
      { "key": "token", "label": "GitHub Personal Access Token", "type": "secret", "required": true },
      { "key": "default_repo", "label": "Default Repository (owner/repo)", "type": "string", "required": false, "hint": "e.g. acme/my-project" }
    ]
  }'
),

(
  'Slack Notifier',
  'Post messages to a Slack channel from your agent. Use it to surface agent status updates, task completions, or alerts without checking the app.',
  'Automation',
  '1.0.0',
  '{
    "fields": [
      { "key": "webhook_url", "label": "Slack Incoming Webhook URL", "type": "secret", "required": true },
      { "key": "default_channel", "label": "Default Channel", "type": "string", "required": false, "hint": "Override the webhook default, e.g. #alerts" }
    ]
  }'
),

(
  'Cron Trigger',
  'Run your agent on a schedule. Define a cron expression and your agent will be invoked automatically at the specified interval.',
  'Automation',
  '1.0.0',
  '{
    "fields": [
      { "key": "cron_expression", "label": "Cron Expression", "type": "string", "required": true, "hint": "e.g. 0 9 * * 1-5 (weekdays at 9am)" },
      { "key": "timezone", "label": "Timezone", "type": "string", "required": false, "default": "UTC" }
    ]
  }'
),

(
  'Webhook Receiver',
  'Trigger your agent from external HTTP events. Generate a unique webhook URL and any POST to it will invoke the agent with the payload as context.',
  'Automation',
  '1.0.0',
  '{
    "fields": [
      { "key": "secret_token", "label": "Webhook Secret (for signature verification)", "type": "secret", "required": false },
      { "key": "filter_field", "label": "JSON Path Filter (optional)", "type": "string", "required": false, "hint": "e.g. body.event == ''push''" }
    ]
  }'
),

(
  'Memory Store',
  'Persist key-value facts across agent sessions. Your agent can store, retrieve, and update long-term context that survives restarts.',
  'Data',
  '1.0.0',
  '{
    "fields": [
      { "key": "namespace", "label": "Memory Namespace", "type": "string", "required": false, "default": "default", "hint": "Isolate memories by project or context" },
      { "key": "max_entries", "label": "Max Stored Entries", "type": "number", "required": false, "default": 100 }
    ]
  }'
),

(
  'Browser Screenshot',
  'Capture screenshots of web pages. Your agent can visually inspect URLs, capture rendered HTML, or document UI states as part of a task.',
  'Information',
  '1.0.0',
  '{
    "fields": [
      { "key": "viewport_width", "label": "Viewport Width (px)", "type": "number", "required": false, "default": 1280 },
      { "key": "viewport_height", "label": "Viewport Height (px)", "type": "number", "required": false, "default": 800 },
      { "key": "full_page", "label": "Capture Full Page", "type": "boolean", "required": false, "default": false }
    ]
  }'
),

(
  'Email Sender',
  'Send emails from your agent. Use it for task summaries, alerts, or any output that should land in an inbox.',
  'Automation',
  '1.0.0',
  '{
    "fields": [
      { "key": "smtp_host", "label": "SMTP Host", "type": "string", "required": true },
      { "key": "smtp_port", "label": "SMTP Port", "type": "number", "required": false, "default": 587 },
      { "key": "smtp_user", "label": "SMTP Username", "type": "string", "required": true },
      { "key": "smtp_password", "label": "SMTP Password", "type": "secret", "required": true },
      { "key": "from_address", "label": "From Address", "type": "string", "required": true }
    ]
  }'
);
