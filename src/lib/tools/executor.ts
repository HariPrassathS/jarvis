// ──────────────────────────────────────────────
// Tool Executor — Dispatches tool calls to handlers with Clearance Gating
// ──────────────────────────────────────────────

import type { ToolCall, ToolResult, ClearanceLevel } from '@/types';
import { TOOL_CLEARANCE_MAP } from './definitions';
import { getWeather } from './weather';
import { webSearch } from './search';
import { rememberFact, recallMemories } from './memory';
import { calculate } from './calculate';
import { runSystemDiagnostics } from './diagnostics';
import { executeStarkProtocol, StarkProtocolName } from './protocols';
import { computeFlightDynamics } from './flight';
import { getCalendarEvents } from './calendar';
import { recallUploadedFiles } from './files';
import { jarvisCache } from '@/lib/llm/cache';

export interface ToolExecutionContext {
  googleAccessToken?: string;
  clearanceLevel?: ClearanceLevel;
}

/**
 * Execute a tool call from the LLM and return the result.
 */
export async function executeTool(
  toolCall: ToolCall,
  profileId: string,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  const { name, arguments: argsStr } = toolCall.function;

  // 1. Security & Clearance Gating Check
  const requiredLevel = TOOL_CLEARANCE_MAP[name] || 1;
  const operatorLevel = context?.clearanceLevel ?? 9;

  if (operatorLevel < requiredLevel) {
    return {
      tool_call_id: toolCall.id,
      name,
      content: `[SECURITY PROTOCOL: ACCESS RESTRICTED. Tool "${name}" requires Clearance Level ${requiredLevel}. Your current standing is Level ${operatorLevel}. Please request operational elevation.]`,
    };
  }

  let args: Record<string, any> = {};
  try {
    if (argsStr && argsStr.trim()) {
      args = JSON.parse(argsStr);
    }
  } catch {
    return {
      tool_call_id: toolCall.id,
      name,
      content: 'Error: Invalid tool arguments',
    };
  }

  let content: string;

  switch (name) {
    case 'get_weather': {
      const loc = args.location || 'Malibu';
      const cacheKey = `weather:${loc.toLowerCase()}`;
      const cached = jarvisCache.get<string>(cacheKey);
      if (cached) {
        content = cached;
      } else {
        content = await getWeather(loc);
        jarvisCache.set(cacheKey, content, 300000); // 5 min TTL
      }
      break;
    }

    case 'web_search':
      content = await webSearch(args.query || '');
      break;

    case 'calculate': {
      const expr = args.expression || '';
      const cacheKey = `calc:${expr}`;
      const cached = jarvisCache.get<string>(cacheKey);
      if (cached) {
        content = cached;
      } else {
        content = calculate(expr);
        jarvisCache.set(cacheKey, content, 3600000); // 1 hr TTL
      }
      break;
    }

    case 'system_diagnostics':
      content = await runSystemDiagnostics(profileId);
      break;

    case 'execute_protocol': {
      content = executeStarkProtocol({
        protocol: args.protocol as StarkProtocolName,
        suit_model: args.suit_model,
        target_system: args.target_system,
        power_percentage: args.power_percentage ? Number(args.power_percentage) : undefined,
      });
      break;
    }

    case 'flight_dynamics': {
      content = computeFlightDynamics({
        calculation_type: args.calculation_type,
        mass_kg: args.mass_kg ? Number(args.mass_kg) : undefined,
        altitude_km: args.altitude_km ? Number(args.altitude_km) : undefined,
        velocity_mach: args.velocity_mach ? Number(args.velocity_mach) : undefined,
        thrust_kilonewtons: args.thrust_kilonewtons ? Number(args.thrust_kilonewtons) : undefined,
      });
      break;
    }

    case 'remember':
      content = await rememberFact(profileId, args.key, args.value);
      break;

    case 'recall_memories': {
      const memories = await recallMemories(profileId);
      if (memories.length === 0) {
        content = 'No long-term memories stored yet, sir.';
      } else {
        content =
          'Stored memories:\n' +
          memories.map((m) => `- ${m.key}: ${m.value}${m.mention_count && m.mention_count > 1 ? ` (referenced ${m.mention_count}x)` : ''}`).join('\n');
      }
      break;
    }

    case 'recall_uploaded_files': {
      content = await recallUploadedFiles(profileId, {
        query: args.query,
        file_type: args.file_type,
        time_range: args.time_range,
        limit: args.limit ? Number(args.limit) : undefined,
      });
      break;
    }

    case 'get_calendar_events': {
      content = await getCalendarEvents(
        {
          time_frame: args.time_frame,
          max_results: args.max_results ? Number(args.max_results) : undefined,
        },
        context?.googleAccessToken
      );
      break;
    }

    default:
      content = `Unknown tool: ${name}`;
  }

  return {
    tool_call_id: toolCall.id,
    name,
    content,
  };
}

/**
 * Execute all tool calls in parallel and return results.
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  profileId: string,
  context?: ToolExecutionContext
): Promise<ToolResult[]> {
  return Promise.all(
    toolCalls.map((tc) => executeTool(tc, profileId, context))
  );
}
