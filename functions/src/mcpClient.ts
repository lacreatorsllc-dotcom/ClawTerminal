type JsonRpcEnvelope<T> = {
  jsonrpc?: string
  id?: string | number
  result?: T
  error?: {
    code?: number
    message?: string
  }
}

type ToolCallResult = {
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
}

type McpClientOptions = {
  name: string
  baseUrl: string
  apiKeyEnvVar?: string
  protocolVersion?: string
  clientVersion?: string
}

export class StreamableHttpMcpClient {
  private readonly name: string
  private readonly baseUrl: string
  private readonly apiKeyEnvVar?: string
  private readonly protocolVersion: string
  private readonly clientVersion: string
  private activeSessionId: string | null = null
  private initializationPromise: Promise<string> | null = null

  constructor(options: McpClientOptions) {
    this.name = options.name
    this.baseUrl = options.baseUrl
    this.apiKeyEnvVar = options.apiKeyEnvVar
    this.protocolVersion = options.protocolVersion ?? '2025-03-26'
    this.clientVersion = options.clientVersion ?? '1.0.0'
  }

  async callToolText(name: string, args: Record<string, unknown>, allowRetry = true): Promise<string> {
    const sessionId = await this.initializeSession()
    const response = await this.postJsonRpc(
      {
        jsonrpc: '2.0',
        id: `${name}-${Date.now()}`,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      },
      sessionId,
    )

    if ((response.status === 400 || response.status === 404) && allowRetry) {
      this.activeSessionId = null
      return this.callToolText(name, args, false)
    }

    if (!response.ok) {
      throw new Error(`${this.name} ${name} failed with ${response.status}`)
    }

    const payload = await response.text()
    const parsed = this.parseSseJson<ToolCallResult>(payload)
    if (parsed.error) {
      throw new Error(parsed.error.message ?? `${this.name} ${name} failed`)
    }
    if (parsed.result?.isError) {
      const text = this.extractToolText(parsed.result)
      throw new Error(text || `${this.name} ${name} returned an error`)
    }

    return this.extractToolText(parsed.result)
  }

  async listTools(): Promise<Array<{ name?: string; description?: string }>> {
    const sessionId = await this.initializeSession()
    const response = await this.postJsonRpc(
      {
        jsonrpc: '2.0',
        id: `tools-list-${Date.now()}`,
        method: 'tools/list',
        params: {},
      },
      sessionId,
    )

    if (!response.ok) {
      throw new Error(`${this.name} tools/list failed with ${response.status}`)
    }

    const payload = await response.text()
    const parsed = this.parseSseJson<{ tools?: Array<{ name?: string; description?: string }> }>(payload)
    if (parsed.error) {
      throw new Error(parsed.error.message ?? `${this.name} tools/list failed`)
    }

    return parsed.result?.tools ?? []
  }

  private buildHeaders(sessionId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    }

    const apiKey = this.apiKeyEnvVar
      ? String(process.env[this.apiKeyEnvVar] ?? '').trim()
      : ''
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`
    }
    if (sessionId) {
      headers['mcp-session-id'] = sessionId
    }
    return headers
  }

  private async postJsonRpc(body: Record<string, unknown>, sessionId?: string) {
    return fetch(this.baseUrl, {
      method: 'POST',
      headers: this.buildHeaders(sessionId),
      body: JSON.stringify(body),
    })
  }

  private parseSseJson<T>(payload: string): JsonRpcEnvelope<T> {
    const matches = [...payload.matchAll(/^data:\s*(.+)$/gm)]
    if (matches.length === 0) {
      throw new Error(`${this.name} MCP returned no data payload`)
    }

    const last = matches[matches.length - 1]?.[1]
    if (!last) {
      throw new Error(`${this.name} MCP returned an empty data payload`)
    }

    return JSON.parse(last) as JsonRpcEnvelope<T>
  }

  private extractToolText(result?: ToolCallResult): string {
    return (result?.content ?? [])
      .filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
  }

  private async initializeSession(): Promise<string> {
    if (this.activeSessionId) return this.activeSessionId
    if (this.initializationPromise) return this.initializationPromise

    this.initializationPromise = (async () => {
      const response = await this.postJsonRpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: this.protocolVersion,
          capabilities: {},
          clientInfo: { name: this.name, version: this.clientVersion },
        },
      })

      if (!response.ok) {
        throw new Error(`${this.name} initialize failed with ${response.status}`)
      }

      const sessionId = response.headers.get('mcp-session-id')
      if (!sessionId) {
        throw new Error(`${this.name} MCP did not return an mcp-session-id`)
      }

      const payload = await response.text()
      const parsed = this.parseSseJson<Record<string, unknown>>(payload)
      if (parsed.error) {
        throw new Error(parsed.error.message ?? `${this.name} initialize failed`)
      }

      const notify = await this.postJsonRpc(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        sessionId,
      )
      if (!notify.ok && notify.status !== 202) {
        throw new Error(`${this.name} initialized notification failed with ${notify.status}`)
      }

      this.activeSessionId = sessionId
      return sessionId
    })()

    try {
      return await this.initializationPromise
    } finally {
      this.initializationPromise = null
    }
  }
}
