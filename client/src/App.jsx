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
import SentEmails from './pages/SentEmails';
import PartnerCadence from './pages/PartnerCadence';
import Analytics from './pages/Analytics';
import TaskQueue from './pages/TaskQueue';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agents" element={<AgentManager />} />
        <Route path="/cadences" element={<CadenceBuilder />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/sent" element={<SentEmails />} />
        <Route path="/partner-cadence" element={<PartnerCadence />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/tasks" element={<TaskQueue />} />
        <Route path="/lists" element={<ListManager />} />
        <Route path="/lists/scrub/:agentId" element={<AccountScrub />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
