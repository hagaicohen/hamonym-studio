-- Apply before deploying the Simulation settings API; never run at startup.
-- A control record only: existing clocks, financial records and triggers stay unchanged.
CREATE TABLE admin_simulation_clock (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT false,
  fixed_at TIMESTAMPTZ,
  updated_by BIGINT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No client policies: only the privileged Backend connection can manage this state.
ALTER TABLE admin_simulation_clock ENABLE ROW LEVEL SECURITY;
