// ──────────────────────────────────────────────
// Tool Definitions — OpenAI-style function schemas
// ──────────────────────────────────────────────

import type { ToolDefinition } from '@/types';

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
        'Store a crucial fact, preference, project code, or specification in long-term memory for future recall across sessions.',
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
        'Explicitly retrieve all stored memories and user facts from the database.',
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
        'Execute Stark Armor Protocols and Armor Telemetry. Supports: "mark_status" (suit telemetry & nanotech reserves), "veronica_satellite" (orbital Hulkbuster deployment), "house_party_protocol" (vault suit standby), "power_redistribution" (shunting power to repulsors/thrusters/shields), "sentry_mode", "stealth_mode", and "clean_slate".',
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
        'Perform advanced aerospace and orbital mechanics calculations. Supports: "orbital_velocity", "escape_velocity", "mach_kinetic_energy", "reentry_thermal_load", "thrust_to_weight".',
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
];

