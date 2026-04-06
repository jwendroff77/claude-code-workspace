import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import AgentManager from './pages/AgentManager';
import CadenceBuilder from './pages/CadenceBuilder';
import Inbox from './pages/Inbox';
import Pipeline from './pages/Pipeline';
import ListManager from './pages/ListManager';
import Settings from './pages/Settings';
import AccountScrub from './pages/AccountScrub';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agents" element={<AgentManager />} />
        <Route path="/cadences" element={<CadenceBuilder />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/lists" element={<ListManager />} />
        <Route path="/lists/scrub/:agentId" element={<AccountScrub />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
