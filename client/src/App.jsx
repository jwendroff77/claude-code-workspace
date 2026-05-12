import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
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
import SignalIntel from './pages/SignalIntel';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  function handleLogin(t) {
    setToken(t);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Routes>
      <Route element={<Layout onLogout={handleLogout} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agents" element={<AgentManager />} />
        <Route path="/cadences" element={<CadenceBuilder />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/sent" element={<SentEmails />} />
        <Route path="/partner-cadence" element={<PartnerCadence />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/signal-intel" element={<SignalIntel />} />
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
