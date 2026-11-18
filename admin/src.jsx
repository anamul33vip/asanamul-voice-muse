import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const LIVE_API = 'https://asanamul-voice-muse.onrender.com';

function App() {
  const [base, setBase] = useState(LIVE_API);
  const [token, setToken] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [seedMsg, setSeedMsg] = useState('');
  const [days, setDays] = useState(30);
  const [newKey, setNewKey] = useState(null);
  const [keyMsg, setKeyMsg] = useState('');
  const [keys, setKeys] = useState([]);

  const auth = { Authorization: 'Bearer ' + token };

  async function load() {
    try {
      let r = await fetch(base + '/api/admin/summary', { headers: auth });
      let j = await r.json();
      setData(r.ok ? j : null);
      setMsg(r.ok ? 'Connected' : 'Check admin token / API');
      if (r.ok) refreshKeys();
    } catch { setMsg('API unavailable'); }
  }

  async function refreshKeys() {
    try {
      let r = await fetch(base + '/api/admin/keys', { headers: auth });
      if (r.ok) setKeys(await r.json());
    } catch { /* keys list is optional */ }
  }

  async function seedVoices() {
    setSeedMsg('Seeding…');
    try {
      let r = await fetch(base + '/api/admin/seed-voices', { method: 'POST', headers: auth });
      let j = await r.json();
      setSeedMsg(r.ok ? 'Voice A seeded ✓' : ('Failed: ' + (j.error || r.status)));
      if (r.ok) load();
    } catch (e) { setSeedMsg('Failed: ' + e.message); }
  }

  async function createKey() {
    setKeyMsg('Creating…');
    setNewKey(null);
    try {
      let r = await fetch(base + '/api/admin/keys', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(days) || 30 }),
      });
      let j = await r.json();
      if (!r.ok) { setKeyMsg('Failed: ' + (j.error || r.status)); return; }
      setNewKey(j);
      setKeyMsg('Key created — copy it now, it is shown only once.');
      refreshKeys();
    } catch (e) { setKeyMsg('Failed: ' + e.message); }
  }

  return (
    <main>
      <header><h1>AS ANAMUL VOICE</h1><span>ADMIN • RGB CONTROL CENTER</span></header>

      <section>
        <h2>Backend connection</h2>
        <input value={base} onChange={e => setBase(e.target.value)} placeholder="Backend URL" />
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="Admin bearer token" type="password" />
        <button onClick={load}>Connect dashboard</button>
        <p>{msg}</p>
      </section>

      <section>
        <h2>Overview</h2>
        {data
          ? <div className="stats"><b>Users: {data.users}</b><b>Voices: {data.voices}</b><b>Generations: {data.generations}</b></div>
          : <p>Connect to view live metrics.</p>}
      </section>

      <section>
        <h2>Voice Profiles</h2>
        <p>Seed the default voice (Voice A — Jessica, female, ElevenLabs) so the app has a voice to use.</p>
        <button onClick={seedVoices}>Seed Voice A</button>
        <p>{seedMsg}</p>
      </section>

      <section>
        <h2>Access Keys</h2>
        <label>Days valid</label>
        <input type="number" min="1" max="365" value={days} onChange={e => setDays(e.target.value)} />
        <button onClick={createKey}>Create key</button>
        <p>{keyMsg}</p>
        {newKey && (
          <div>
            <label>New key (copy now — shown only once)</label>
            <input readOnly value={newKey.key} onFocus={e => e.target.select()} />
            <p>Expires: {newKey.expiresAt}</p>
          </div>
        )}
        {keys.length > 0 && (
          <div>
            <h3>Keys</h3>
            {keys.map(k => (
              <p key={k.id}>#{k.id} • {k.status} • expires {k.expires_at} • created {k.created_at}</p>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Management modules</h2>
        <div className="grid">{['Users & Access Keys', 'Coupons & Extensions', 'Voice Profiles / IDs', 'TTS Providers', 'Generation History', 'Audio Library', 'App Configuration', 'APK Updates', 'Announcements', 'Audit Logs'].map(x => <article key={x}>{x}</article>)}</div>
        <p>Key creation and voice seeding above are live against the authenticated /api/admin routes.</p>
      </section>

      <footer><a href="https://t.me/crackffpanel">Telegram Support</a></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
