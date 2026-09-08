// The bundled scenarios the toolbar offers, in order. An id is a directory
// under data/scenarios; the name is that scenario's answer_key.scenario_name,
// copied here so the dropdown can list every option before any file loads.
export interface ScenarioOption {
  id: string;
  name: string;
}

export const SCENARIOS: readonly ScenarioOption[] = [
  { id: "attack-chain-01", name: "Finance file-server exfiltration" },
  { id: "benign-lookalike-02", name: "Benign lookalike (busy IT night, no attack)" },
];

export const DEFAULT_SCENARIO_ID = SCENARIOS[0].id;
