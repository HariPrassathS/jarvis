// ──────────────────────────────────────────────
// Tool Definitions — OpenAI-style function schemas & Clearance Gating
// Level 1 (Cadet/Standard): basic search, calc, weather, diagnostics
// Level 5 (Specialist/Tactical): memory persistence, suit protocols, flight dynamics
// Level 9 (Executive/Stark Direct): Google calendar manipulation & full protocol suite
// ──────────────────────────────────────────────

import type { ToolDefinition, ClearanceLevel } from '@/types';

export const TOOL_CLEARANCE_MAP: Record<string, ClearanceLevel> = {
  get_weather: 1,
  calculate: 1,
  web_search: 1,
  system_diagnostics: 1,
  recall_uploaded_files: 1,
  remember: 5,
  recall_memories: 5,
  execute_protocol: 5,
  flight_dynamics: 5,
  get_calendar_events: 9,
};

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        'Get the current weather and meteorological conditions for any location. Use when the user asks about weather, flight conditions, temperature, or rain.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name or location, e.g. "Malibu", "Tokyo, Japan", "London"',
          },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for real-time information, news, technology developments, and current facts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query string',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description:
        'Perform accurate mathematical, geometric, or physics calculations and formula evaluations. Use for math equations, unit conversions, and physics computations.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to compute, e.g. "sqrt(250 * 9.81) / 4.2", "2^16", "1000 * cos(pi / 4)"',
          },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'system_diagnostics',
      description:
        'Run comprehensive diagnostic and telemetry check on JARVIS core systems, active neural routes, database connection, and memory engrams.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description:
        'Store a crucial fact, preference, project code, or specification in long-term memory for future recall across sessions. (Requires Clearance Level 5+)',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'A concise label for the memory engram, e.g. "secret_project_code", "flight_clearance", "arc_reactor_model"',
          },
          value: {
            type: 'string',
            description: 'The exact value or detail to remember',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_memories',
      description:
        'Explicitly retrieve all stored memories and user facts from the database. (Requires Clearance Level 5+)',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_protocol',
      description:
        'Execute Stark Armor Protocols and Armor Telemetry. Supports: "mark_status" (suit telemetry & nanotech reserves), "veronica_satellite" (orbital Hulkbuster deployment), "house_party_protocol" (vault suit standby), "power_redistribution" (shunting power to repulsors/thrusters/shields), "sentry_mode", "stealth_mode", and "clean_slate". (Requires Clearance Level 5+)',
      parameters: {
        type: 'object',
        properties: {
          protocol: {
            type: 'string',
            description:
              'The protocol name: "mark_status", "veronica_satellite", "house_party_protocol", "power_redistribution", "sentry_mode", "stealth_mode", "clean_slate"',
          },
          suit_model: {
            type: 'string',
            description: 'Optional suit model, e.g. "Mark LXXXV", "Mark 50", "Hulkbuster"',
          },
          target_system: {
            type: 'string',
            description: 'Optional subsystem for power redistribution: "repulsors", "shields", "thrusters", "life_support"',
          },
          power_percentage: {
            type: 'number',
            description: 'Percentage of power to allocate (0-100)',
          },
        },
        required: ['protocol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'flight_dynamics',
      description:
        'Perform advanced aerospace and orbital mechanics calculations. Supports: "orbital_velocity", "escape_velocity", "mach_kinetic_energy", "reentry_thermal_load", "thrust_to_weight". (Requires Clearance Level 5+)',
      parameters: {
        type: 'object',
        properties: {
          calculation_type: {
            type: 'string',
            description:
              'Type of calculation: "orbital_velocity", "escape_velocity", "mach_kinetic_energy", "reentry_thermal_load", "thrust_to_weight"',
          },
          mass_kg: {
            type: 'number',
            description: 'Mass in kilograms (default 180kg)',
          },
          altitude_km: {
            type: 'number',
            description: 'Altitude above Earth in kilometers',
          },
          velocity_mach: {
            type: 'number',
            description: 'Flight velocity in Mach numbers (e.g. 3, 5, 8.5)',
          },
          thrust_kilonewtons: {
            type: 'number',
            description: 'Thrust in kiloNewtons for TWR calculations',
          },
        },
        required: ['calculation_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_uploaded_files',
      description:
        'Retrieve and recall past uploaded images, photos, visual telemetry scans, or documents previously shared by the operator. Use when the user asks about a photo, screenshot, image, or document sent earlier (e.g. "what was in that photo I sent yesterday?", "the document from earlier", "that screenshot"). Returns stored AI descriptions and metadata.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Optional search term or keyword to find relevant files by filename or content description (e.g. "radar", "schematic", "receipt", "screenshot", "flight manual")',
          },
          file_type: {
            type: 'string',
            enum: ['image', 'document', 'all'],
            description: 'Filter by file type: "image", "document", or "all"',
          },
          time_range: {
            type: 'string',
            enum: ['today', 'yesterday', 'this_week', 'all'],
            description: 'Optional time filter: "today", "yesterday", "this_week", or "all"',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_events',
      description:
        "Retrieve upcoming events, meetings, and schedule items from the operator's Google Calendar. Supports querying today's schedule, tomorrow's schedule, or the upcoming week. (Requires Clearance Level 9)",
      parameters: {
        type: 'object',
        properties: {
          time_frame: {
            type: 'string',
            enum: ['today', 'tomorrow', 'this_week', 'upcoming'],
            description:
              'The time window to retrieve events for: "today", "tomorrow", "this_week", or "upcoming" (next 7 days). Defaults to "today".',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of events to retrieve (default 10, max 25).',
          },
        },
        required: [],
      },
    },
  },
];

/**
 * Filter available tool definitions strictly by operator clearance level.
 */
export function getToolsForClearance(clearanceLevel: number = 9): ToolDefinition[] {
  return toolDefinitions.filter((tool) => {
    const minClearance = TOOL_CLEARANCE_MAP[tool.function.name] || 1;
    return clearanceLevel >= minClearance;
  });
}
