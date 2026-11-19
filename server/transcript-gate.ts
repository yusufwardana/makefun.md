import type { TranscriptGateCheckResult, TranscriptGateReport } from '../src/types/command-center.ts';

interface ParsedRecord {
  role?: string;
  timestamp?: string;
  hasText?: boolean;
  isToolUse?: boolean;
  isToolResult?: boolean;
  isEditOrWrite?: boolean;
  hasUsage?: boolean;
}

function extractRecordsFromContent(rawContent: string): {
  records: ParsedRecord[];
  timestamps: number[];
  anchorDetected: boolean;
} {
  const lines = rawContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const records: ParsedRecord[] = [];
  const timestamps: number[] = [];
  const anchorDetected = /makefun\s+anchor\s+[0-9a-f]{7,64}\s+round\s+\d+/i.test(rawContent);

  const tryPushJsonObj = (obj: Record<string, unknown>) => {
    const role = String(obj.role || obj.type || (obj.message && typeof obj.message === 'object' ? (obj.message as Record<string, unknown>).role : '') || '').toLowerCase();
    const tsRaw = obj.timestamp || obj.created_at || obj.createdAt || obj.ts || obj.time;
    const tsStr = typeof tsRaw === 'string' ? tsRaw : undefined;
    if (tsStr) {
      const parsedTs = Date.parse(tsStr);
      if (Number.isFinite(parsedTs)) timestamps.push(parsedTs);
    }

    const msgObj =
      obj.message && typeof obj.message === 'object'
        ? (obj.message as Record<string, unknown>)
        : obj;
    const serialized = JSON.stringify(msgObj);
    const hasUsage = Boolean(
      obj.usage ||
        msgObj.usage ||
        obj.model ||
        msgObj.model ||
        /prompt_tokens|input_tokens|output_tokens/i.test(serialized)
    );

    const content = msgObj.content ?? obj.msg ?? obj.text ?? '';
    let hasText = false;
    let isToolUse = false;
    let isToolResult = false;
    let isEditOrWrite = false;

    if (typeof content === 'string') {
      hasText = content.trim().length > 0;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;
        const bType = String(b.type || '').toLowerCase();
        if (bType === 'text' || bType === 'thinking') {
          if (String(b.text || b.thinking || '').trim().length > 0) hasText = true;
        } else if (bType === 'tool_use' || bType === 'function_call') {
          isToolUse = true;
          const toolName = String(b.name || '').toLowerCase();
          if (/(write|edit|patch|replace|create_file|apply_patch)/i.test(toolName)) {
            isEditOrWrite = true;
          }
        } else if (bType === 'tool_result' || bType === 'function_response') {
          isToolResult = true;
        }
      }
    }

    if (/(write_to_file|replace_file_content|edit_file|apply_patch|main\.py|main\.ts)/i.test(serialized) && role === 'assistant') {
      isEditOrWrite = true;
    }

    records.push({
      role: role || 'unknown',
      timestamp: tsStr,
      hasText,
      isToolUse,
      isToolResult,
      isEditOrWrite,
      hasUsage,
    });
  };

  // Try whole-file JSON first
  try {
    const whole = JSON.parse(rawContent);
    if (Array.isArray(whole)) {
      for (const item of whole) {
        if (item && typeof item === 'object') tryPushJsonObj(item as Record<string, unknown>);
      }
    } else if (whole && typeof whole === 'object') {
      const obj = whole as Record<string, unknown>;
      const nested = Array.isArray(obj.messages)
        ? obj.messages
        : Array.isArray(obj.turns)
          ? obj.turns
          : Array.isArray(obj.events)
            ? obj.events
            : null;
      if (nested) {
        for (const item of nested) {
          if (item && typeof item === 'object') tryPushJsonObj(item as Record<string, unknown>);
        }
      } else {
        tryPushJsonObj(obj);
      }
    }
  } catch {
    // Fallback to JSONL line-by-line or plain-text timestamp scan
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object') {
          tryPushJsonObj(parsed as Record<string, unknown>);
          continue;
        }
      } catch {
        // Plain log line
      }
      const tsMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/);
      if (tsMatch) {
        const t = Date.parse(tsMatch[0]);
        if (Number.isFinite(t)) timestamps.push(t);
      }
      const isAssistant = /\b(assistant|hermes|muse|model)\b/i.test(line);
      const isEdit = /(write|edit|patch|main\.py|main\.ts)/i.test(line);
      records.push({
        role: isAssistant ? 'assistant' : 'log',
        timestamp: tsMatch?.[0],
        hasText: line.length > 10,
        isEditOrWrite: isEdit,
        hasUsage: /tokens|model/i.test(line),
      });
    }
  }

  return { records, timestamps, anchorDetected };
}

export function evaluateTranscriptGates(params: {
  rawContent: string;
  bountySlug: string | null;
  competitionPublishedAt?: string | null;
  competitionDeadline?: string | null;
}): TranscriptGateReport {
  const { records, timestamps, anchorDetected } = extractRecordsFromContent(params.rawContent);

  const assistantTextTurns = records.filter(
    (r) => r.role === 'assistant' && r.hasText
  ).length;
  const toolEditTurns = records.filter((r) => r.isEditOrWrite).length;
  const usageRecordsCount = records.filter((r) => r.hasUsage).length;

  // Check monotonic timestamps within 60s skew
  let nonMonotonicCount = 0;
  let maxSeenTs = 0;
  for (const ts of timestamps) {
    if (maxSeenTs > 0 && ts < maxSeenTs - 60_000) {
      nonMonotonicCount += 1;
    }
    if (ts > maxSeenTs) maxSeenTs = ts;
  }

  // Check window if bounty dates supplied
  let windowStatus: TranscriptGateCheckResult['status'] = 'warn';
  let windowDetail = 'Link a bounty in Evidence Monitor to verify timestamps against its publishedAt window.';
  if (params.competitionPublishedAt && timestamps.length > 0) {
    const openTs = Date.parse(params.competitionPublishedAt) - 60_000;
    const closeTs = params.competitionDeadline ? Date.parse(params.competitionDeadline) + 60_000 : Number.MAX_SAFE_INTEGER;
    const outOfWindow = timestamps.filter((t) => t < openTs || t > closeTs).length;
    if (outOfWindow === 0) {
      windowStatus = 'pass';
      windowDetail = `All ${timestamps.length} parsed timestamps lie within competition opening window.`;
    } else {
      windowStatus = 'fail';
      windowDetail = `${outOfWindow} of ${timestamps.length} timestamp(s) fall outside competition open/deadline window.`;
    }
  } else if (params.competitionPublishedAt && timestamps.length === 0) {
    windowStatus = 'fail';
    windowDetail = 'No ISO timestamps found to verify competition window.';
  }

  const checks: TranscriptGateCheckResult[] = [
    {
      gateId: 'transcripts_present',
      title: 'Session & Messages Present',
      status: records.length > 0 ? 'pass' : 'fail',
      detail:
        records.length > 0
          ? `Parsed ${records.length} record(s) from exported evidence.`
          : 'No structured session records or log lines parsed.',
    },
    {
      gateId: 'thinking_wellformed',
      title: 'Timestamps & Turn Ordering',
      status:
        timestamps.length >= Math.min(records.length, 2) && nonMonotonicCount === 0
          ? 'pass'
          : timestamps.length === 0
            ? 'fail'
            : 'warn',
      detail:
        timestamps.length === 0
          ? 'No valid ISO timestamps detected; make.fun requires timestamps on user/assistant/tool messages.'
          : nonMonotonicCount > 0
            ? `${nonMonotonicCount} timestamp(s) fell >60s behind previous turn.`
            : `${timestamps.length} monotonic timestamp(s) verified (within 60s tolerance).`,
    },
    {
      gateId: 'thinking_in_window',
      title: 'Competition Time Window',
      status: windowStatus,
      detail: windowDetail,
    },
    {
      gateId: 'thinking_committed',
      title: 'Signed Bundle Hash Binding',
      status: 'manual_at_submit',
      detail: 'Verified by make.fun CLI/API at submission when entry_signature binds transcript sha256.',
    },
    {
      gateId: 'thinking_reproduces',
      title: 'Authored Code Coverage (>=30%)',
      status: toolEditTurns >= 1 ? 'pass' : 'warn',
      detail:
        toolEditTurns >= 1
          ? `Detected ${toolEditTurns} write/edit action(s); run makefun bundle check for exact line coverage.`
          : 'No explicit file write/edit tool calls detected in this snippet.',
    },
    {
      gateId: 'thinking_turns',
      title: 'Assistant Reasoning Turns (>=5)',
      status: assistantTextTurns >= 5 ? 'pass' : 'fail',
      detail: `Detected ${assistantTextTurns} assistant turn(s) with text/thinking (minimum 5 required).`,
    },
    {
      gateId: 'thinking_priced',
      title: 'Known Model Usage Pricing',
      status: usageRecordsCount > 0 ? 'pass' : 'warn',
      detail:
        usageRecordsCount > 0
          ? `Found ${usageRecordsCount} record(s) containing model/token usage metadata.`
          : 'No token/model usage metadata detected; pricing check requires usage records.',
    },
    {
      gateId: 'thinking_revised',
      title: 'Iterative Revisions (>=2 Edits)',
      status: toolEditTurns >= 2 ? 'pass' : 'fail',
      detail: `Detected ${toolEditTurns} write/edit revision(s) (minimum 2 assistant edits required).`,
    },
    {
      gateId: 'thinking_fresh',
      title: 'Source Bundle Anchor Freshness',
      status: anchorDetected ? 'pass' : 'warn',
      detail: anchorDetected
        ? 'Detected makefun anchor <root sha> round <round> in transcript.'
        : 'No makefun anchor line detected (required only for source_bundle uploads; optional for GitHub repo entries).',
    },
  ];

  const hardFailures = checks.filter((c) => c.status === 'fail').length;
  return {
    checkedAt: new Date().toISOString(),
    bountySlug: params.bountySlug,
    parsedRecords: records.length,
    assistantTextTurns,
    toolEditTurns,
    timestampsCount: timestamps.length,
    usageRecordsCount,
    anchorDetected,
    overallReady: hardFailures === 0 && records.length > 0,
    checks,
  };
}
