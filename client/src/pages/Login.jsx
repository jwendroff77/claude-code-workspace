import { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
      } else {
        localStorage.setItem('token', data.token);
        onLogin(data.token);
      }
    } catch {
      setError('Server error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f1117',
    }}>
      <div style={{
        background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12,
        padding: '40px 48px', width: 380,
      }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          1Cloud Sales Platform
        </h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 32 }}>Sign in to continue</p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#aaa', fontSize: 13, display: 'block', marginBottom: 6 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', background: '#0f1117',
                border: '1px solid #2a2d3a', borderRadius: 6, color: '#fff',
                fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: '#aaa', fontSize: 13, display: 'block', marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', background: '#0f1117',
                border: '1px solid #2a2d3a', borderRadius: 6, color: '#fff',
                fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>
          {error && (
            <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px', background: '#6366f1', border: 'none',
              borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
