import { AiAgentBuilder } from "../components/AiAgentBuilder";
import { useNavigate } from "react-router-dom";

export function BuilderPage() {
  const navigate = useNavigate();
  return (
    <AiAgentBuilder
      onClose={() => navigate("/agents")}
      onCreated={(agentId) => navigate(`/agents/${agentId}`)}
    />
  );
}
