import { useState, useEffect } from 'react';
import { supabase } from './supabase';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getStatus(val, low, high) {
  if (val < low || val > high) return { bg:'#fde8e8', text:'#b91c1c', abn:true };
  const pct = high === 999 ? 0.5 : (val - low) / (high - low);
  if (pct < 0.15 || pct > 0.85) return { bg:'#fef3c7', text:'#92400e', abn:false };
  return { bg:'#d1fae5', text:'#065f46', abn:false };
}

function today() { return new Date().toISOString().slice(0,10); }
function todayName() { return DAYS[new Date().getDay()]; }
function itemOnDay(item) { return !item.days || item.days.includes(todayName()); }

function getWeekDates() {
  const d = new Date();
  const day = d.getDay();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const nd = new Date(d);
    nd.setDate(d.getDate() - day + i);
    dates.push(nd);
  }
  return dates;
}

function Avatar({ name, size = 36 }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const colors = ['#0f1f4b','#16a34a','#7c3aed','#dc2626','#0369a1'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{width:size,height:size,borderRadius:'50%',background:color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
      <span style={{color:'#fff',fontWeight:700,fontSize:size*0.35}}>{initials}</span>
    </div>
  );
}

function Bar({ pct, color }) {
  const c = color || (pct >= 90 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444');
  return (
    <div style={{background:'#e5e7eb',borderRadius:99,height:8,overflow:'hidden'}}>
      <div style={{background:c,height:'100%',width:pct+'%',borderRadius:99,transition:'width 0.3s'}}></div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('signin');

  async function handleSignIn() {
    setLoading(true); setErr('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) { setErr(error.message); setLoading(false); return; }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
    onLogin({ ...data.user, ...profile });
    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true); setErr('');
    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    if (error) { setErr(error.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from('profiles').insert({ id: data.user.id, email, name: email.split('@')[0], role: 'patient', streak: 0 });
      setErr('Account created! Check your email to confirm, then sign in.');
    }
    setLoading(false);
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:14, boxSizing:'border-box', color:'#111', marginBottom:12 };

  return (
    <div style={{minHeight:'100vh',background:'#0f1f4b',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{background:'#fff',borderRadius:16,padding:'2rem',width:'min(400px,100%)'}}>
        <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
          <div style={{fontSize:28,fontWeight:700,color:'#0f1f4b'}}>BioTrack MD</div>
          <div style={{fontSize:13,color:'#6b7280',marginTop:4}}>Personalized biohacking protocols</div>
        </div>
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {['signin','signup'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{flex:1,padding:'8px',borderRadius:8,border:'none',cursor:'pointer',background:mode===m?'#0f1f4b':'#f3f4f6',color:mode===m?'#fff':'#374151',fontWeight:mode===m?700:400,fontSize:13}}>
              {m === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inp} />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" onKeyDown={e => { if (e.key === 'Enter') mode === 'signin' ? handleSignIn() : handleSignUp(); }} style={inp} />
        {err && <div style={{background:'#fde8e8',color:'#b91c1c',borderRadius:8,padding:'10px 12px',fontSize:13,marginBottom:12}}>{err}</div>}
        <button onClick={mode === 'signin' ? handleSignIn : handleSignUp} disabled={loading} style={{width:'100%',padding:'12px',borderRadius:8,background:'#0f1f4b',color:'#fff',border:'none',cursor:'pointer',fontSize:15,fontWeight:700}}>
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
        <div style={{marginTop:16,background:'#f8fafc',borderRadius:8,padding:'12px',fontSize:12,color:'#6b7280',textAlign:'center'}}>
          Doctors: sign in with your doctor account credentials.
        </div>
      </div>
    </div>
  );
}

// ─── DOCTOR DASHBOARD ─────────────────────────────────────────────────────────
function DoctorDashboard({ user, onLogout }) {
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('list');
  const [ptab, setPtab] = useState('overview');
  const [supplements, setSupplements] = useState([]);
  const [peptides, setPeptides] = useState([]);
  const [notes, setNotes] = useState([]);
  const [bloodwork, setBloodwork] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [editing, setEditing] = useState(false);
  const [newS, setNewS] = useState({ name:'', dose:'', time:'Breakfast', benefit:'' });
  const [newP, setNewP] = useState({ name:'', dose:'', draw:'', time:'Morning Fasted', goal:'Recovery', notes:'' });
  const [aiQ, setAiQ] = useState('');
  const [aiR, setAiR] = useState('');
  const [aiL, setAiL] = useState(false);

  useEffect(() => { loadPatients(); }, []);

  async function loadPatients() {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'patient');
    setPatients(data || []);
  }

  async function openPatient(p) {
    setSelected(p); setView('patient'); setPtab('overview');
    const [s, pe, n, bw] = await Promise.all([
      supabase.from('supplements').select('*').eq('patient_id', p.id),
      supabase.from('peptides').select('*').eq('patient_id', p.id),
      supabase.from('notes').select('*').eq('patient_id', p.id).order('created_at'),
      supabase.from('bloodwork').select('*').eq('patient_id', p.id).order('created_at', { ascending: false }),
    ]);
    setSupplements(s.data || []); setPeptides(pe.data || []);
    setNotes(n.data || []); setBloodwork(bw.data || []);
  }

  async function sendNote() {
    if (!noteText.trim()) return;
    const n = { patient_id: selected.id, from_role: 'doctor', date: new Date().toLocaleDateString('en-US'), text: noteText };
    await supabase.from('notes').insert(n);
    setNotes([...notes, n]); setNoteText('');
  }

  async function addSupp() {
    if (!newS.name.trim()) return;
    const { data } = await supabase.from('supplements').insert({ ...newS, patient_id: selected.id }).select().single();
    setSupplements([...supplements, data]);
    setNewS({ name:'', dose:'', time:'Breakfast', benefit:'' });
  }

  async function removeSupp(id) {
    await supabase.from('supplements').delete().eq('id', id);
    setSupplements(supplements.filter(s => s.id !== id));
  }

  async function addPep() {
    if (!newP.name.trim()) return;
    const { data } = await supabase.from('peptides').insert({ ...newP, patient_id: selected.id }).select().single();
    setPeptides([...peptides, data]);
    setNewP({ name:'', dose:'', draw:'', time:'Morning Fasted', goal:'Recovery', notes:'' });
  }

  async function removePep(id) {
    await supabase.from('peptides').delete().eq('id', id);
    setPeptides(peptides.filter(p => p.id !== id));
  }

  async function runAI(q) {
    setAiL(true); setAiR('');
    const ctx = { patient: { name: selected.name, age: selected.age, weight: selected.weight }, supplements: supplements.map(s => s.name + ' ' + s.dose), peptides: peptides.map(p => p.name + ' ' + p.dose), bloodwork: bloodwork[0] || {} };
    const msg = q ? 'Doctor question: ' + q + '\n\nPatient: ' + JSON.stringify(ctx) : 'Analyze patient. Key observations, protocol assessment, top recommendations.\n\nData: ' + JSON.stringify(ctx);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: 'Expert functional medicine consultant advising a doctor on patient biohacking protocols.', messages: [{ role: 'user', content: msg }] }) });
      const d = await r.json();
      setAiR(d.content?.[0]?.text || 'No response.');
    } catch(e) { setAiR('Error: ' + e.message); }
    setAiL(false);
  }

  const card = { background:'#fff', borderRadius:10, padding:'14px 16px', marginBottom:8, border:'0.5px solid #e5e7eb' };
  const inp = { padding:'8px 10px', borderRadius:8, border:'1px solid #d1d5db', fontSize:13, color:'#111', width:'100%', boxSizing:'border-box' };
  const PTABS = ['Overview','Protocol','Blood Work','Notes','AI Consult'];

  if (view === 'list') return (
    <div style={{fontFamily:'system-ui,sans-serif',background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#0f1f4b',padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{color:'#fff'}}>
          <div style={{fontSize:18,fontWeight:700}}>BioTrack MD</div>
          <div style={{fontSize:12,opacity:0.7}}>Doctor Dashboard — {user.name || user.email}</div>
        </div>
        <button onClick={onLogout} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',padding:'7px 14px',borderRadius:8,cursor:'pointer',fontSize:13}}>Sign out</button>
      </div>
      <div style={{maxWidth:860,margin:'0 auto',padding:'1.25rem'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:20}}>
          {[{ l:'Total patients', v:patients.length, c:'#e0f2fe' }, { l:'Active protocols', v:patients.length, c:'#d1fae5' }].map(s => (
            <div key={s.l} style={{background:s.c,borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:12,color:'#374151',fontWeight:600,marginBottom:4}}>{s.l}</div>
              <div style={{fontSize:26,fontWeight:700,color:'#0f1f4b'}}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:16,fontWeight:700,color:'#0f1f4b',marginBottom:12}}>Patients</div>
        {patients.length === 0 && <div style={{...card,textAlign:'center',color:'#6b7280',padding:'3rem'}}>No patients yet. Patients will appear here after they create an account.</div>}
        {patients.map(p => (
          <div key={p.id} onClick={() => openPatient(p)} style={{...card,cursor:'pointer',display:'flex',alignItems:'center',gap:14}} onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.1)'} onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
            <Avatar name={p.name || p.email} />
            <div style={{flex:1}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <span style={{fontWeight:700,fontSize:15,color:'#0f1f4b'}}>{p.name || p.email}</span>
                <span style={{fontSize:13,color:'#9ca3af'}}>→</span>
              </div>
              <div style={{fontSize:12,color:'#6b7280'}}>{p.email}{p.age ? ' · ' + p.age + 'y' : ''}{p.weight ? ' · ' + p.weight : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:'system-ui,sans-serif',background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#0f1f4b',padding:'14px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
          <button onClick={() => { setView('list'); setEditing(false); }} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:13}}>← Back</button>
          <Avatar name={selected.name || selected.email} size={40} />
          <div>
            <div style={{fontSize:17,fontWeight:700,color:'#fff'}}>{selected.name || selected.email}</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,0.7)'}}>{selected.email}</div>
          </div>
          <button onClick={onLogout} style={{marginLeft:'auto',background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',padding:'7px 14px',borderRadius:8,cursor:'pointer',fontSize:13}}>Sign out</button>
        </div>
        <div style={{display:'flex',gap:4,overflowX:'auto'}}>
          {PTABS.map(t => <button key={t} onClick={() => setPtab(t.toLowerCase().replace(' ', ''))} style={{padding:'6px 12px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,background:ptab===t.toLowerCase().replace(' ','') ? 'rgba(255,255,255,0.25)' : 'transparent',color:'#fff',fontWeight:ptab===t.toLowerCase().replace(' ','') ? 700 : 400,whiteSpace:'nowrap'}}>{t}</button>)}
        </div>
      </div>
      <div style={{maxWidth:860,margin:'0 auto',padding:'1.25rem'}}>

        {ptab === 'overview' && (
          <div>
            <div style={{...card,background:'#e0f2fe'}}>
              <div style={{fontWeight:700,color:'#0c4a6e',fontSize:14,marginBottom:8}}>Patient profile</div>
              {[['Name', selected.name || 'Not set'], ['Email', selected.email], ['Age', selected.age || 'Not set'], ['Weight', selected.weight || 'Not set']].map(r => (
                <div key={r[0]} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid #bae6fd',fontSize:13}}>
                  <span style={{color:'#0369a1',fontWeight:600}}>{r[0]}</span>
                  <span style={{color:'#0f1f4b'}}>{r[1]}</span>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div style={{...card,textAlign:'center'}}><div style={{fontSize:12,color:'#6b7280',marginBottom:4}}>Supplements</div><div style={{fontSize:28,fontWeight:700,color:'#16a34a'}}>{supplements.length}</div></div>
              <div style={{...card,textAlign:'center'}}><div style={{fontSize:12,color:'#6b7280',marginBottom:4}}>Peptides</div><div style={{fontSize:28,fontWeight:700,color:'#6366f1'}}>{peptides.length}</div></div>
            </div>
            {notes.length > 0 && (
              <div style={card}>
                <div style={{fontWeight:700,color:'#0f1f4b',fontSize:14,marginBottom:8}}>Recent notes</div>
                {notes.slice(-2).map((n, i) => <div key={i} style={{background:'#f0f9ff',borderRadius:8,padding:'10px 12px',marginBottom:6,fontSize:13,color:'#374151'}}><div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>{n.date}</div>{n.text}</div>)}
              </div>
            )}
          </div>
        )}

        {ptab === 'protocol' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <span style={{fontWeight:700,color:'#0f1f4b',fontSize:15}}>Protocol Editor</span>
              <button onClick={() => setEditing(!editing)} style={{padding:'7px 14px',borderRadius:8,border:'none',cursor:'pointer',background:editing?'#dc2626':'#0f1f4b',color:'#fff',fontSize:13,fontWeight:700}}>{editing ? 'Done' : 'Edit protocol'}</button>
            </div>
            <div style={{fontWeight:700,color:'#16a34a',fontSize:14,marginBottom:8}}>Supplements ({supplements.length})</div>
            {supplements.map(s => (
              <div key={s.id} style={{...card,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14,color:'#0f1f4b'}}>{s.name} <span style={{fontWeight:400,color:'#6b7280'}}>{s.dose}</span></div>
                  <div style={{fontSize:12,color:'#6b7280'}}>{s.time}</div>
                </div>
                {editing && <button onClick={() => removeSupp(s.id)} style={{background:'#fde8e8',border:'none',color:'#b91c1c',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12,fontWeight:700}}>Remove</button>}
              </div>
            ))}
            {editing && (
              <div style={{...card,background:'#f0fdf4',marginBottom:16}}>
                <div style={{fontWeight:700,color:'#16a34a',fontSize:13,marginBottom:10}}>Add supplement</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Name</div><input value={newS.name} onChange={e => setNewS({...newS,name:e.target.value})} placeholder="e.g. Magnesium" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Dose</div><input value={newS.dose} onChange={e => setNewS({...newS,dose:e.target.value})} placeholder="400mg" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Timing</div><input value={newS.time} onChange={e => setNewS({...newS,time:e.target.value})} placeholder="Before Bed" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Benefit</div><input value={newS.benefit} onChange={e => setNewS({...newS,benefit:e.target.value})} placeholder="Purpose" style={inp} /></div>
                </div>
                <button onClick={addSupp} style={{marginTop:10,padding:'8px 16px',borderRadius:8,background:'#16a34a',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700}}>Add</button>
              </div>
            )}
            <div style={{fontWeight:700,color:'#6366f1',fontSize:14,marginBottom:8,marginTop:8}}>Peptides ({peptides.length})</div>
            {peptides.map(p => (
              <div key={p.id} style={{...card,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14,color:'#0f1f4b'}}>{p.name} <span style={{fontWeight:400,color:'#6b7280'}}>{p.dose} · {p.draw}</span></div>
                  <div style={{fontSize:12,color:'#6b7280'}}>{p.time} · {p.goal}</div>
                </div>
                {editing && <button onClick={() => removePep(p.id)} style={{background:'#fde8e8',border:'none',color:'#b91c1c',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12,fontWeight:700}}>Remove</button>}
              </div>
            ))}
            {editing && (
              <div style={{...card,background:'#eef2ff'}}>
                <div style={{fontWeight:700,color:'#6366f1',fontSize:13,marginBottom:10}}>Add peptide</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Name</div><input value={newP.name} onChange={e => setNewP({...newP,name:e.target.value})} placeholder="BPC-157" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Dose</div><input value={newP.dose} onChange={e => setNewP({...newP,dose:e.target.value})} placeholder="0.5mg" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Draw</div><input value={newP.draw} onChange={e => setNewP({...newP,draw:e.target.value})} placeholder="10 units" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Timing</div><input value={newP.time} onChange={e => setNewP({...newP,time:e.target.value})} placeholder="Morning Fasted" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Goal</div><input value={newP.goal} onChange={e => setNewP({...newP,goal:e.target.value})} placeholder="Recovery" style={inp} /></div>
                  <div><div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Notes</div><input value={newP.notes} onChange={e => setNewP({...newP,notes:e.target.value})} placeholder="Vial info" style={inp} /></div>
                </div>
                <button onClick={addPep} style={{marginTop:10,padding:'8px 16px',borderRadius:8,background:'#6366f1',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700}}>Add</button>
              </div>
            )}
          </div>
        )}

        {ptab === 'bloodwork' && (
          <div>
            {bloodwork.length === 0 ? <div style={{...card,textAlign:'center',color:'#6b7280',padding:'3rem'}}>No blood work on file</div> :
            bloodwork.map((bw, i) => (
              <div key={i} style={card}>
                <div style={{fontWeight:700,color:'#0f1f4b',marginBottom:10}}>Labs — {bw.date}</div>
                {(bw.values || []).map(m => {
                  const st = getStatus(m.val, m.low, m.high);
                  return <div key={m.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'0.5px solid #f3f4f6'}}>
                    <div><span style={{fontWeight:500,fontSize:13,color:'#111'}}>{m.name}</span><span style={{fontSize:11,color:'#9ca3af',marginLeft:6}}>{m.unit}</span></div>
                    <span style={{background:st.bg,color:st.text,borderRadius:99,padding:'3px 10px',fontWeight:700,fontSize:12}}>{m.val}{st.abn ? (m.val > m.high ? ' H' : ' L') : ''}</span>
                  </div>;
                })}
              </div>
            ))}
          </div>
        )}

        {ptab === 'notes' && (
          <div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
              {notes.map((n, i) => (
                <div key={i} style={{...card,background:n.from_role==='doctor'?'#e0f2fe':'#f0fdf4'}}>
                  <div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>{n.from_role === 'doctor' ? 'Doctor' : 'Patient'} · {n.date}</div>
                  <div style={{fontSize:14,color:'#111'}}>{n.text}</div>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{fontWeight:700,color:'#0f1f4b',fontSize:14,marginBottom:10}}>Send note to {selected.name?.split(' ')[0] || 'patient'}</div>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Protocol changes, recommendations..." rows={4} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:14,boxSizing:'border-box',resize:'vertical',color:'#111'}} />
              <button onClick={sendNote} style={{marginTop:10,padding:'9px 20px',borderRadius:8,background:'#0f1f4b',color:'#fff',border:'none',cursor:'pointer',fontSize:14,fontWeight:700}}>Send</button>
            </div>
          </div>
        )}

        {ptab === 'aiconsult' && (
          <div>
            <div style={{...card,background:'#e0f2fe',marginBottom:14}}>
              <div style={{fontWeight:700,color:'#0c4a6e',fontSize:14,marginBottom:4}}>AI Clinical Consultant</div>
              <div style={{fontSize:13,color:'#0369a1'}}>Ask anything about {selected.name?.split(' ')[0] || 'this patient'} — protocol optimization, lab interpretation, dosing recommendations.</div>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
              <input value={aiQ} onChange={e => setAiQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runAI(aiQ); }} placeholder="Ask about this patient..." style={{flex:1,minWidth:200,padding:'10px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:14,color:'#111'}} />
              <button onClick={() => runAI(aiQ)} style={{padding:'10px 16px',borderRadius:8,background:'#0f1f4b',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700}}>Ask</button>
              <button onClick={() => runAI('')} style={{padding:'10px 16px',borderRadius:8,background:'#6366f1',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700}}>Full analysis</button>
            </div>
            {['Is the protocol safe?','Optimize for fat loss','Review peptide stack','Flag any interactions'].map(q => (
              <button key={q} onClick={() => { setAiQ(q); runAI(q); }} style={{marginRight:8,marginBottom:8,padding:'6px 12px',borderRadius:99,background:'#f3f4f6',border:'0.5px solid #d1d5db',cursor:'pointer',fontSize:12,color:'#374151'}}>{q}</button>
            ))}
            {aiL && <div style={{...card,color:'#6b7280',fontSize:14}}>Analyzing...</div>}
            {aiR && <div style={{...card,fontSize:14,lineHeight:1.7,whiteSpace:'pre-wrap',color:'#111'}}>{aiR}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PATIENT APP ──────────────────────────────────────────────────────────────
function PatientApp({ user, onLogout }) {
  const [tab, setTab] = useState(0);
  const [supplements, setSupplements] = useState([]);
  const [peptides, setPeptides] = useState([]);
  const [notes, setNotes] = useState([]);
  const [bloodwork, setBloodwork] = useState([]);
  const [checks, setChecks] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const TABS = ['Overview', 'Supplements', 'Peptides', 'Blood Work', 'This Week'];
  const td = today();
  const tn = todayName();
  const weekDates = getWeekDates();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [s, p, n, bw, cl] = await Promise.all([
      supabase.from('supplements').select('*').eq('patient_id', user.id),
      supabase.from('peptides').select('*').eq('patient_id', user.id),
      supabase.from('notes').select('*').eq('patient_id', user.id).order('created_at'),
      supabase.from('bloodwork').select('*').eq('patient_id', user.id).order('created_at', { ascending: false }),
      supabase.from('checklist_logs').select('*').eq('patient_id', user.id),
    ]);
    setSupplements(s.data || []);
    setPeptides(p.data || []);
    setNotes(n.data || []);
    setBloodwork(bw.data || []);
    const c = {};
    (cl.data || []).forEach(log => {
      if (!c[log.date]) c[log.date] = {};
      c[log.date][log.item_id] = log.completed;
    });
    setChecks(c);
  }

  function toggleCheck(dateKey, id) {
    setChecks(prev => {
      const cur = prev[dateKey]?.[id] || false;
      return { ...prev, [dateKey]: { ...(prev[dateKey] || {}), [id]: !cur } };
    });
  }

  async function saveChecks() {
    setSaving(true); setSaveMsg('');
    try {
      const entries = [];
      Object.keys(checks).forEach(date => {
        Object.keys(checks[date]).forEach(itemId => {
          entries.push({ patient_id: user.id, date, item_id: itemId, completed: checks[date][itemId] });
        });
      });
      await supabase.from('checklist_logs').delete().eq('patient_id', user.id);
      if (entries.length > 0) await supabase.from('checklist_logs').insert(entries);
      setSaveMsg('✓ Saved!');
    } catch(e) {
      setSaveMsg('Error saving');
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  function isChecked(dateKey, id) { return !!(checks[dateKey] && checks[dateKey][id]); }

  const todaySupps = supplements.filter(itemOnDay);
  const todayPeps = peptides.filter(itemOnDay);
  const totalItems = todaySupps.length + todayPeps.length;
  const doneItems = [...todaySupps, ...todayPeps].filter(i => isChecked(td, i.id)).length;
  const todayPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const card = { background:'#fff', borderRadius:10, padding:'14px 16px', marginBottom:8, border:'0.5px solid #e5e7eb' };

  function ItemRow({ item, type, dateKey }) {
    const dk = dateKey || td;
    const checked = isChecked(dk, item.id);
    const ac = type === 'supplement' ? '#16a34a' : '#6366f1';
    return (
      <div onClick={() => toggleCheck(dk, item.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,marginBottom:4,cursor:'pointer',background:checked?(type==='supplement'?'#f0fdf4':'#eef2ff'):'#f9fafb',border:checked?('1px solid '+(type==='supplement'?'#86efac':'#a5b4fc')):'1px solid #e5e7eb',userSelect:'none'}}>
        <div style={{width:22,height:22,borderRadius:5,border:'2px solid '+(checked?ac:'#d1d5db'),background:checked?ac:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          {checked && <span style={{color:'#fff',fontSize:12,fontWeight:700}}>✓</span>}
        </div>
        <div style={{flex:1,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,fontWeight:600,color:checked?'#6b7280':'#111',textDecoration:checked?'line-through':'none'}}>{item.name}</span>
          <span style={{fontSize:12,color:'#6b7280'}}>{item.dose || item.draw}</span>
        </div>
      </div>
    );
  }

  function DayModal({ dateKey, dayName, onClose }) {
    const si = supplements.filter(i => !i.days || i.days.includes(dayName));
    const pi = peptides.filter(i => !i.days || i.days.includes(dayName));
    const sd = si.filter(i => isChecked(dateKey, i.id)).length;
    const pd = pi.filter(i => isChecked(dateKey, i.id)).length;
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:'1rem'}}>
        <div style={{background:'#fff',borderRadius:14,width:'min(480px,100%)',maxHeight:'88vh',overflowY:'auto',padding:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:'#0f1f4b'}}>{dayName}</div>
              <div style={{fontSize:13,color:'#6b7280'}}>{new Date(dateKey + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}</div>
            </div>
            <button onClick={onClose} style={{background:'none',border:'none',fontSize:24,cursor:'pointer',color:'#6b7280'}}>×</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
            <div style={{background:'#f0fdf4',borderRadius:8,padding:'10px',textAlign:'center'}}><div style={{fontSize:11,color:'#15803d',fontWeight:600}}>Supplements</div><div style={{fontSize:22,fontWeight:700,color:'#16a34a'}}>{sd}/{si.length}</div></div>
            <div style={{background:'#eef2ff',borderRadius:8,padding:'10px',textAlign:'center'}}><div style={{fontSize:11,color:'#4338ca',fontWeight:600}}>Peptides</div><div style={{fontSize:22,fontWeight:700,color:'#6366f1'}}>{pd}/{pi.length}</div></div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:'#16a34a',marginBottom:8}}>Supplements</div>
          {si.map(item => <ItemRow key={item.id} item={item} type="supplement" dateKey={dateKey} />)}
          <div style={{fontSize:13,fontWeight:700,color:'#6366f1',marginBottom:8,marginTop:12}}>Peptide Injections</div>
          {pi.map(item => <ItemRow key={item.id} item={item} type="peptide" dateKey={dateKey} />)}
          <button onClick={saveChecks} style={{width:'100%',marginTop:14,padding:'12px',borderRadius:10,background:'#0f1f4b',color:'#fff',border:'none',cursor:'pointer',fontSize:14,fontWeight:700}}>{saving ? 'Saving...' : '💾 Save Progress'}</button>
          {saveMsg && <div style={{textAlign:'center',marginTop:8,fontSize:13,color:'#16a34a',fontWeight:700}}>{saveMsg}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{fontFamily:'system-ui,sans-serif',background:'#2d2d2d',minHeight:'100vh'}}>
      <div style={{background:'#0f1f4b',padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>BioTrack MD</div>
          <div style={{fontSize:12,color:'rgba(255,255,255,0.7)'}}>{user.name || user.email}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:18,fontWeight:700,color:todayPct===100?'#4ade80':'#fbbf24'}}>{todayPct}%</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.6)'}}>Today</div>
          </div>
          <button onClick={saveChecks} style={{padding:'8px 14px',borderRadius:8,background:'#fff',color:'#0f1f4b',border:'none',cursor:'pointer',fontSize:13,fontWeight:700}}>{saving ? 'Saving...' : '💾 Save'}</button>
          <button onClick={onLogout} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:12}}>Sign out</button>
        </div>
      </div>

      {saveMsg && <div style={{background:'#16a34a',color:'#fff',textAlign:'center',padding:'8px',fontSize:13,fontWeight:700}}>{saveMsg}</div>}

      <div style={{display:'flex',gap:2,overflowX:'auto',background:'#fff',padding:'4px 8px'}}>
        {TABS.map((t, i) => <button key={t} onClick={() => setTab(i)} style={{padding:'7px 12px',cursor:'pointer',fontSize:12,border:'none',background:'none',borderBottom:tab===i?'2px solid #0f1f4b':'2px solid transparent',fontWeight:tab===i?700:400,color:tab===i?'#0f1f4b':'#6b7280',whiteSpace:'nowrap'}}>{t}</button>)}
      </div>

      <div style={{maxWidth:600,margin:'0 auto',padding:'1rem'}}>

        {tab === 0 && (
          <div style={{background:'#e8f4fd',borderRadius:10,padding:'1rem'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              {[
                { l:'Today', v:todayPct+'%', s:doneItems+' of '+totalItems+' done', c:todayPct===100?'#d1fae5':'#fef3c7' },
                { l:'Supplements', v:supplements.length, s:'in protocol', c:'#d1fae5' },
                { l:'Peptides', v:peptides.length, s:'in protocol', c:'#ede9fe' },
                { l:'Streak', v:(user.streak||0)+' days', s:'Keep going', c:'#e0f2fe' },
              ].map(s => <div key={s.l} style={{background:s.c,borderRadius:8,padding:'12px'}}><div style={{fontSize:11,color:'#0f1f4b',fontWeight:600,marginBottom:4}}>{s.l}</div><div style={{fontSize:22,fontWeight:700,color:'#0f1f4b'}}>{s.v}</div><div style={{fontSize:11,color:'#0f1f4b'}}>{s.s}</div></div>)}
            </div>
            <div style={{background:'#fff',borderRadius:10,padding:'14px'}}>
              <div style={{fontWeight:700,fontSize:14,color:'#0f1f4b',marginBottom:4}}>Today — {new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' })}</div>
              <Bar pct={todayPct} />
              <div style={{marginTop:12}}>
                {todaySupps.map(item => <ItemRow key={item.id} item={item} type="supplement" />)}
                {todayPeps.map(item => <ItemRow key={item.id} item={item} type="peptide" />)}
                {totalItems === 0 && <div style={{textAlign:'center',color:'#6b7280',padding:'1rem',fontSize:13}}>Your doctor will add your protocol soon.</div>}
              </div>
              <button onClick={saveChecks} style={{width:'100%',marginTop:12,padding:'11px',borderRadius:10,background:'#0f1f4b',color:'#fff',border:'none',cursor:'pointer',fontSize:14,fontWeight:700}}>{saving ? 'Saving...' : '💾 Save Progress'}</button>
              {saveMsg && <div style={{textAlign:'center',marginTop:8,fontSize:13,color:'#16a34a',fontWeight:700}}>{saveMsg}</div>}
            </div>
            {notes.length > 0 && (
              <div style={{background:'#fff',borderRadius:10,padding:'14px',marginTop:10}}>
                <div style={{fontWeight:700,fontSize:14,color:'#0f1f4b',marginBottom:8}}>Latest from your doctor</div>
                <div style={{background:'#f0f9ff',borderRadius:8,padding:'10px 12px',fontSize:13,color:'#374151'}}>
                  <div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>{notes[notes.length-1].date}</div>
                  {notes[notes.length-1].text}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 1 && (
          <div>
            {['Upon Waking','Breakfast','Lunch','Dinner','Before Bed'].map(time => {
              const items = supplements.filter(s => s.time === time);
              if (items.length === 0) return null;
              const colors = { 'Upon Waking':'#fef9c3','Breakfast':'#e0f2fe','Lunch':'#f0fdf4','Dinner':'#fce7f3','Before Bed':'#ede9fe' };
              const tcolors = { 'Upon Waking':'#713f12','Breakfast':'#0c4a6e','Lunch':'#14532d','Dinner':'#701a75','Before Bed':'#4c1d95' };
              return (
                <div key={time} style={{marginBottom:12}}>
                  <div style={{background:colors[time],borderRadius:8,padding:'7px 14px',marginBottom:6,fontWeight:700,fontSize:13,color:tcolors[time]}}>{time}</div>
                  {items.map((s, i) => (
                    <div key={i} style={{...card,marginBottom:4}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontWeight:700,fontSize:14,color:'#0f1f4b'}}>{s.name}</span>
                        <span style={{fontSize:13,fontWeight:700,color:'#0f1f4b'}}>{s.dose}</span>
                      </div>
                      {s.benefit && <div style={{fontSize:12,color:'#374151'}}><span style={{fontWeight:700,color:'#0f1f4b'}}>Benefits: </span>{s.benefit}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
            {supplements.length === 0 && <div style={{...card,textAlign:'center',color:'#6b7280',padding:'3rem'}}>Your doctor will add your supplement protocol soon.</div>}
          </div>
        )}

        {tab === 2 && (
          <div>
            {['Morning Fasted','Midday','Evening','Before Bed'].map(time => {
              const items = peptides.filter(p => p.time === time);
              if (items.length === 0) return null;
              const colors = { 'Morning Fasted':'#fef9c3','Midday':'#e0f2fe','Evening':'#fce7f3','Before Bed':'#ede9fe' };
              const tcolors = { 'Morning Fasted':'#713f12','Midday':'#0c4a6e','Evening':'#701a75','Before Bed':'#4c1d95' };
              return (
                <div key={time} style={{marginBottom:12}}>
                  <div style={{background:colors[time],borderRadius:8,padding:'7px 14px',marginBottom:6,fontWeight:700,fontSize:13,color:tcolors[time]}}>{time}</div>
                  {items.map((p, i) => (
                    <div key={i} style={{...card,marginBottom:4}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,flexWrap:'wrap',gap:4}}>
                        <div>
                          <span style={{fontWeight:700,fontSize:14,color:'#0f1f4b'}}>{p.name}</span>
                          <span style={{marginLeft:8,fontSize:11,background:'#dbeafe',color:'#1e40af',borderRadius:99,padding:'2px 6px'}}>{p.goal}</span>
                        </div>
                        <span style={{fontSize:12,color:'#6b7280'}}>{p.days ? p.days.join('/') : 'Daily'}</span>
                      </div>
                      <div style={{display:'flex',gap:14,fontSize:13,marginBottom:3}}>
                        <span><span style={{color:'#6b7280'}}>Dose: </span><strong>{p.dose}</strong></span>
                        <span><span style={{color:'#6b7280'}}>Draw: </span>{p.draw}</span>
                      </div>
                      {p.notes && <div style={{fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>{p.notes}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
            {peptides.length === 0 && <div style={{...card,textAlign:'center',color:'#6b7280',padding:'3rem'}}>Your doctor will add your peptide protocol soon.</div>}
          </div>
        )}

        {tab === 3 && (
          <div>
            {bloodwork.length === 0 ? <div style={{...card,textAlign:'center',color:'#6b7280',padding:'3rem'}}>No blood work on file yet</div> :
            bloodwork.map((bw, i) => (
              <div key={i} style={card}>
                <div style={{fontWeight:700,color:'#0f1f4b',marginBottom:10}}>Labs — {bw.date}</div>
                {(bw.values || []).map(m => {
                  const st = getStatus(m.val, m.low, m.high);
                  return <div key={m.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'0.5px solid #f3f4f6'}}>
                    <div><span style={{fontWeight:500,fontSize:13,color:'#111'}}>{m.name}</span><span style={{fontSize:11,color:'#9ca3af',marginLeft:6}}>{m.unit}</span></div>
                    <span style={{background:st.bg,color:st.text,borderRadius:99,padding:'3px 10px',fontWeight:700,fontSize:12}}>{m.val}{st.abn ? (m.val > m.high ? ' H' : ' L') : ''}</span>
                  </div>;
                })}
              </div>
            ))}
          </div>
        )}

        {tab === 4 && (
          <div>
            <div style={{fontSize:13,color:'#ccc',marginBottom:12,textAlign:'center'}}>Tap any day to check off your protocol</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6,marginBottom:14}}>
              {weekDates.map(d => {
                const key = d.toISOString().slice(0,10);
                const dn = DAYS[d.getDay()];
                const si = supplements.filter(i => !i.days || i.days.includes(dn));
                const pi = peptides.filter(i => !i.days || i.days.includes(dn));
                const total = si.length + pi.length;
                const done = [...si,...pi].filter(i => isChecked(key, i.id)).length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const isToday = key === td;
                const bg = done === 0 ? '#1e3a8a' : pct === 100 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
                return (
                  <div key={key} onClick={() => setSelectedDate({ key, name:dn })} style={{background:bg,borderRadius:10,padding:'8px 4px',textAlign:'center',cursor:'pointer',border:isToday?'3px solid #fbbf24':'3px solid transparent'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.8)',marginBottom:2}}>{dn}</div>
                    <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>{d.getDate()}</div>
                    {isToday && <div style={{fontSize:8,color:'#fbbf24',fontWeight:700}}>TODAY</div>}
                    {done > 0 && <div style={{fontSize:9,color:'rgba(255,255,255,0.9)',marginTop:2}}>{pct}%</div>}
                  </div>
                );
              })}
            </div>
            {weekDates.map(d => {
              const key = d.toISOString().slice(0,10);
              const dn = DAYS[d.getDay()];
              const si = supplements.filter(i => !i.days || i.days.includes(dn));
              const pi = peptides.filter(i => !i.days || i.days.includes(dn));
              const sd = si.filter(i => isChecked(key, i.id)).length;
              const pd = pi.filter(i => isChecked(key, i.id)).length;
              const isToday = key === td;
              return (
                <div key={key} onClick={() => setSelectedDate({ key, name:dn })} style={{...card,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',border:isToday?'2px solid #0f1f4b':'0.5px solid #e5e7eb'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:sd+pd===0?'#d1d5db':sd===si.length&&pd===pi.length?'#22c55e':'#f59e0b'}}></div>
                    <span style={{fontWeight:isToday?700:500,fontSize:13,color:'#0f1f4b'}}>{dn} {d.getDate()}{isToday?' (Today)':''}</span>
                  </div>
                  <div style={{display:'flex',gap:10,alignItems:'center'}}>
                    <span style={{fontSize:12,color:'#16a34a'}}>{sd}/{si.length} supps</span>
                    <span style={{fontSize:12,color:'#6366f1'}}>{pd}/{pi.length} peptides</span>
                    <span style={{fontSize:12,color:'#9ca3af'}}>→</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
      {selectedDate && <DayModal dateKey={selectedDate.key} dayName={selectedDate.name} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setUser({ ...session.user, ...profile });
      }
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setUser({ ...session.user, ...profile });
      } else {
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#0f1f4b',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,fontWeight:700}}>
      BioTrack MD
    </div>
  );

  if (!user) return <LoginScreen onLogin={setUser} />;
  if (user.role === 'doctor') return <DoctorDashboard user={user} onLogout={handleLogout} />;
  return <PatientApp user={user} onLogout={handleLogout} />;
}