// ──────────────────────────────────────────────
// Flight Dynamics & Orbital Mechanics Engine
// ──────────────────────────────────────────────

export interface FlightDynamicsParams {
  calculation_type:
    | 'orbital_velocity'
    | 'escape_velocity'
    | 'reentry_thermal_load'
    | 'mach_kinetic_energy'
    | 'thrust_to_weight';
  mass_kg?: number;
  altitude_km?: number;
  velocity_mach?: number;
  thrust_kilonewtons?: number;
}

export function computeFlightDynamics(params: FlightDynamicsParams): string {
  const { calculation_type, mass_kg = 180, altitude_km = 10, velocity_mach = 3, thrust_kilonewtons = 45 } = params;

  const G = 6.6743e-11; // Gravitational constant
  const M_EARTH = 5.972e24; // Earth mass (kg)
  const R_EARTH = 6.371e6; // Earth radius (m)

  switch (calculation_type) {
    case 'orbital_velocity': {
      const r = R_EARTH + altitude_km * 1000;
      const v = Math.sqrt((G * M_EARTH) / r); // m/s
      const v_kmh = (v * 3.6).toFixed(1);
      const period_min = ((2 * Math.PI * r) / v / 60).toFixed(1);

      return JSON.stringify({
        telemetry: 'CIRCULAR_ORBITAL_VELOCITY',
        altitude: `${altitude_km} km`,
        orbital_speed_mps: v.toFixed(2),
        orbital_speed_kmh: `${v_kmh} km/h`,
        orbital_period: `${period_min} minutes`,
        centrifugal_balance: 'EQUILIBRIUM',
        analysis: `At ${altitude_km} km altitude, maintaining a circular orbit requires ${v_kmh} km/h (${v.toFixed(1)} m/s), sir. Orbital period is ${period_min} minutes.`,
      }, null, 2);
    }

    case 'escape_velocity': {
      const r = R_EARTH + altitude_km * 1000;
      const v_esc = Math.sqrt((2 * G * M_EARTH) / r);
      const v_kmh = (v_esc * 3.6).toFixed(1);

      return JSON.stringify({
        telemetry: 'EARTH_ESCAPE_VELOCITY',
        altitude: `${altitude_km} km`,
        escape_speed_mps: v_esc.toFixed(2),
        escape_speed_kmh: `${v_kmh} km/h (Mach ${(v_esc / 343).toFixed(1)})`,
        energy_requirement: 'Full Arc Reactor Overcharge Recommended',
        analysis: `To break Earth gravitational pull at ${altitude_km} km, you must attain ${v_kmh} km/h, sir. Ensure boot repulsors are set to maximum overcharge.`,
      }, null, 2);
    }

    case 'mach_kinetic_energy': {
      const speed_mps = velocity_mach * 343; // approximate speed of sound
      const ke_joules = 0.5 * mass_kg * Math.pow(speed_mps, 2);
      const ke_megajoules = (ke_joules / 1e6).toFixed(2);
      const g_force = (Math.pow(speed_mps, 2) / (9.81 * 500)).toFixed(1); // 500m turn radius estimate

      return JSON.stringify({
        telemetry: 'MACH_KINETIC_IMPACT_MODEL',
        velocity: `Mach ${velocity_mach} (${speed_mps.toFixed(1)} m/s)`,
        suit_mass: `${mass_kg} kg`,
        kinetic_energy: `${ke_megajoules} MJ`,
        inertial_damper_load: `${g_force} G (Compensated to 1.2 G for pilot)`,
        analysis: `At Mach ${velocity_mach} with a total mass of ${mass_kg} kg, kinetic energy equals ${ke_megajoules} MegaJoules, sir. Inertial dampeners will maintain pilot G-load within safe parameters.`,
      }, null, 2);
    }

    case 'reentry_thermal_load': {
      const speed_mps = velocity_mach * 343;
      // Approximate peak stagnation temperature (Kelvin) = T0 * (1 + 0.2 * M^2)
      const ambient_k = 220; // High altitude temp
      const stag_temp_c = (ambient_k * (1 + 0.2 * Math.pow(velocity_mach, 2)) - 273.15).toFixed(1);
      const gold_titanium_tolerance = 1668; // Titanium melting point °C

      return JSON.stringify({
        telemetry: 'ATMOSPHERIC_REENTRY_THERMAL_PROFILE',
        velocity: `Mach ${velocity_mach}`,
        stagnation_temperature: `${stag_temp_c} °C`,
        armor_material: 'Gold-Titanium / Vibranium Matrix',
        safe_temperature_limit: `${gold_titanium_tolerance} °C`,
        thermal_status: Number(stag_temp_c) < gold_titanium_tolerance ? 'NOMINAL (Within Safe Envelope)' : 'CRITICAL (Ablation Risk)',
        analysis: `Stagnation temperature during atmospheric entry at Mach ${velocity_mach} will peak at ${stag_temp_c}°C. The Gold-Titanium alloy will withstand this with zero structural degradation, sir.`,
      }, null, 2);
    }

    case 'thrust_to_weight': {
      const weight_n = mass_kg * 9.81;
      const thrust_n = thrust_kilonewtons * 1000;
      const twr = (thrust_n / weight_n).toFixed(2);
      const vertical_accel_mps2 = ((thrust_n - weight_n) / mass_kg).toFixed(2);

      return JSON.stringify({
        telemetry: 'THRUST_TO_WEIGHT_RATIO',
        suit_mass: `${mass_kg} kg`,
        total_thrust: `${thrust_kilonewtons} kN`,
        twr_ratio: twr,
        vertical_acceleration: `${vertical_accel_mps2} m/s² (${(Number(vertical_accel_mps2) / 9.81).toFixed(1)} Gs)`,
        climb_capability: Number(twr) > 1 ? 'SUPERSONIC_VERTICAL_CLIMB' : 'SUB_CRITICAL',
        analysis: `Thrust-to-weight ratio is ${twr}:1. Maximum vertical climb acceleration is ${vertical_accel_mps2} m/s², sir.`,
      }, null, 2);
    }

    default:
      return `Unknown calculation type: ${calculation_type}. Valid types: orbital_velocity, escape_velocity, mach_kinetic_energy, reentry_thermal_load, thrust_to_weight.`;
  }
}
