import { useNavigate } from "react-router-dom";

import { AiAgentBuilder } from "../../components/AiAgentBuilder";

export function V2BuilderPage() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">AI Agent Builder</h1>
          <p className="v2-page-subtitle">Describe the agent you need — the builder designs and creates it for you</p>
        </div>
      </div>
      <section className="v2-card" style={{ overflow: "hidden" }}>
        <AiAgentBuilder
          onClose={() => navigate("/v2/agents")}
          onCreated={(agentId) => navigate(`/v2/agents/${agentId}`)}
        />
      </section>
    </div>
  );
}
