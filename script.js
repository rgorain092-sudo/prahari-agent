const SYSTEM_PROMPT = `You are Prahari, a personal AI assistant and study agent.

CONTEXT ABOUT THE STUDENT (background — not a limit on what you can help with):
- BA English Honours student, also preparing for UPSC CSE and SSC CHSL 2026
- SSC CHSL: targeting DEO/DEO Grade 'A' or LDC/JSA posts, giving the exam in Bengali medium
- Long-term goal: UPSC CSE, then a direct PhD

SCOPE — IMPORTANT:
You are not limited to UPSC, SSC CHSL, or BA English topics. Help with absolutely anything the
student brings up — any subject, any academic field, general knowledge, technology, science, coding,
health, everyday questions, creative writing, planning, or anything else. Treat the exam-prep context
above as useful background for tailoring answers when it's relevant (e.g. connecting a topic to
exam-relevant angles when that fits naturally) — never as a reason to redirect, narrow, or decline a
question that falls outside those three areas.

SHOW YOUR THINKING:
Before your final answer, include a short section headed "### Thinking" (2-5 lines) where you reason
through the question out loud — what the question is really asking, what angle to take, what to check
or search for, and how you'll structure the answer. Then head "### Answer" and give the full response
below it, following the structure in Rule 3. Keep the Thinking section brief — it's a window into your
reasoning, not a second full answer.

RULES:
1. Current affairs answers cover National and West Bengal state news relevant to UPSC/SSC/Banking exams, when that's what's asked.
2. Any MCQs or Mains-style questions you write must be clearly labeled as self-study practice material you generated — never implied to be real, leaked, or predicted exam questions.
3. Default to exam-grade depth for study questions, and thorough, well-reasoned depth for everything else. For any concept, doubt, or "explain X" question, structure the answer like this:
   - **Simple explanation** — one or two lines, in plain language
   - **Detailed explanation** — background, how it works, key terms defined
   - **Why it matters / how it connects** — to exams if relevant, or to the broader topic/context otherwise
   - **Example / case study / illustration** — a concrete example, so the idea isn't abstract
   - **Quick recap** — 2-3 bullet points to lock it in
   (Skip sections that don't fit a quick factual question — use judgment.)
4. For current affairs: don't just report the headline — explain the background, why it's in the news now, and the "why it matters."
5. For BA English literature questions: go beyond plot summary — cover historical/literary context, structure, themes, critical perspectives, and possible essay angles.
6. Follow the exact SSC CHSL marking scheme if asked for a mock test.
7. Long and thorough is the default, not the exception — depth matters more than brevity. Stay organized (headers, bullets, short paragraphs) so it's easy to scan.
8. Tone: direct and encouraging, never flattering. Correct mistakes plainly.`;

// ---------- thinking mode toggle ----------
let thinkingMode = 'fast';
document.getElementById('mode-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if(!btn) return;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  thinkingMode = btn.dataset.mode;
});

// ---------- streaming API call ----------
// Streams the reply and calls onChunk(partialTextSoFar) as it arrives.
// Resolves with the full final text once the stream ends.
async function streamAgent(messages, system = SYSTEM_PROMPT, onChunk = null, mode = null){
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, mode: mode || thinkingMode })
  });

  if(!res.ok){
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while(true){
    const { done, value } = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep any incomplete trailing line for next chunk

    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if(!jsonStr) continue;
      try{
        const parsed = JSON.parse(jsonStr);
        const piece = parsed.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if(piece){
          fullText += piece;
          if(onChunk) onChunk(fullText);
        }
      }catch(e){ /* partial JSON mid-chunk — ignore and wait for more data */ }
    }
  }
  return fullText;
}

// ---------- tiny markdown renderer (bold, headers, bullets) ----------
function renderMarkdown(text){
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^#### (.*)$/gm, '<h5>$1</h5>');
  html = html.replace(/^### (.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.*)$/gm, '<h2>$1</h2>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  // group consecutive "- " / "* " lines into a <ul>
  html = html.replace(/(?:^|\n)[*-] (.*)(?=\n|$)/g, (m, item) => '\n<li>' + item + '</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (block) => '<ul>' + block.replace(/\n/g, '') + '</ul>');

  html = html.replace(/\n/g, '<br>');
  return html;
}

// ---------- tabs ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if(!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  if(btn.dataset.tab === 'saved') renderSaved();
});

// ---------- CHAT ----------
const thread = document.getElementById('thread');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const thinking = document.getElementById('thinking');
const chatSend = document.getElementById('chat-send');
let chatHistory = [];

function addStaticMessage(role, text){
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'agent');
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = role === 'user' ? 'You' : 'Prahari';
  div.appendChild(label);
  const body = document.createElement('span');
  if(role === 'agent'){ body.innerHTML = renderMarkdown(text); }
  else { body.textContent = text; }
  div.appendChild(body);
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

// Creates an empty agent bubble and returns the element to update as text streams in
function addLiveAgentMessage(){
  const div = document.createElement('div');
  div.className = 'msg agent';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Prahari';
  div.appendChild(label);
  const body = document.createElement('span');
  body.textContent = '';
  div.appendChild(body);
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
  return { container: div, body };
}

function addSaveButton(container, getText){
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = () => saveNote(getText());
  container.appendChild(document.createElement('br'));
  container.appendChild(saveBtn);
}

async function sendChat(text){
  if(!text.trim()) return;
  addStaticMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  chatInput.value = '';
  chatSend.disabled = true;

  const { container, body } = addLiveAgentMessage();

  try{
    const fullText = await streamAgent(chatHistory, SYSTEM_PROMPT, (partial) => {
      body.innerHTML = renderMarkdown(partial);
      thread.scrollTop = thread.scrollHeight;
    });
    const finalText = fullText || "I couldn't generate a reply — try again.";
    body.innerHTML = renderMarkdown(finalText);
    chatHistory.push({ role: 'assistant', content: finalText });
    addSaveButton(container, () => finalText);
  }catch(err){
    body.textContent = 'Something went wrong: ' + err.message;
  }finally{
    chatSend.disabled = false;
    thread.scrollTop = thread.scrollHeight;
  }
}

chatForm.addEventListener('submit', (e) => { e.preventDefault(); sendChat(chatInput.value); });
chatInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); chatForm.requestSubmit(); }
});
document.querySelectorAll('#panel-chat .chip').forEach(chip => {
  chip.addEventListener('click', () => sendChat(chip.dataset.prompt));
});
addStaticMessage('agent', "Namaste — I'm Prahari. Ask me anything, or use the tabs above for a current affairs digest or a mock test.");

// ---------- DIGEST ----------
const digestOutput = document.getElementById('digest-output');
async function generateDigest(kind){
  const prompt = kind === 'national'
    ? "Give me today's National current affairs digest for UPSC/SSC/Banking prep: 6-8 items, each with background, why it's in the news, and why it's exam-relevant."
    : "Give me today's West Bengal state current affairs digest for UPSC/SSC/Banking prep: 5-6 items, each with background, why it's in the news, and why it's exam-relevant.";
  digestOutput.textContent = '';
  document.getElementById('digest-national').disabled = true;
  document.getElementById('digest-wb').disabled = true;
  try{
    await streamAgent([{ role: 'user', content: prompt }], SYSTEM_PROMPT, (partial) => {
      digestOutput.innerHTML = renderMarkdown(partial);
    }, 'deep');
  }catch(err){
    digestOutput.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }finally{
    document.getElementById('digest-national').disabled = false;
    document.getElementById('digest-wb').disabled = false;
  }
}
document.getElementById('digest-national').addEventListener('click', () => generateDigest('national'));
document.getElementById('digest-wb').addEventListener('click', () => generateDigest('wb'));

// ---------- MOCK TEST ----------
const mockOutput = document.getElementById('mock-output');
const mockGenerateBtn = document.getElementById('mock-generate');

mockGenerateBtn.addEventListener('click', async () => {
  const count = document.getElementById('mock-count').value;
  mockOutput.innerHTML = '<p class="empty-state">Generating your mock set…</p>';
  mockGenerateBtn.disabled = true;
  const prompt = `Generate ${count} SSC CHSL-level practice MCQs as self-study practice material (clearly not real exam questions). Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{"questions":[{"question":"...","options":["A text","B text","C text","D text"],"answer_index":0,"explanation":"..."}]}`;
  try{
    const raw = await streamAgent([{ role: 'user', content: prompt }], SYSTEM_PROMPT, (partial) => {
      mockOutput.innerHTML = `<p class="empty-state">Generating your mock set…</p><pre style="white-space:pre-wrap;font-size:12px;color:var(--ink-soft);">${partial.slice(-600)}</pre>`;
    });
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    renderQuiz(parsed.questions || []);
  }catch(err){
    mockOutput.innerHTML = `<p class="empty-state">Couldn't generate the mock set: ${err.message}</p>`;
  }finally{
    mockGenerateBtn.disabled = false;
  }
});

function renderQuiz(questions){
  mockOutput.innerHTML = '';
  if(!questions.length){
    mockOutput.innerHTML = '<p class="empty-state">No questions came back — try again.</p>';
    return;
  }
  const answers = new Array(questions.length).fill(null);

  questions.forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'q-card';
    const qText = document.createElement('p');
    qText.className = 'q-text';
    qText.textContent = `${qi + 1}. ${q.question}`;
    card.appendChild(qText);
    q.options.forEach((opt, oi) => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'q' + qi;
      radio.value = oi;
      radio.onchange = () => { answers[qi] = oi; };
      label.appendChild(radio);
      label.append(' ' + opt);
      card.appendChild(label);
    });
    card.dataset.index = qi;
    mockOutput.appendChild(card);
  });

  const checkBtn = document.createElement('button');
  checkBtn.className = 'primary-btn';
  checkBtn.textContent = 'Check answers';
  checkBtn.style.marginTop = '4px';
  checkBtn.onclick = () => {
    let score = 0;
    document.querySelectorAll('.q-card').forEach((card) => {
      const qi = Number(card.dataset.index);
      const q = questions[qi];
      const labels = card.querySelectorAll('label');
      labels.forEach((label, oi) => {
        if(oi === q.answer_index) label.classList.add('correct');
        else if(answers[qi] === oi) label.classList.add('incorrect');
      });
      if(answers[qi] === q.answer_index) score += 1;
      else if(answers[qi] !== null) score -= 0.5;
      const expl = document.createElement('p');
      expl.style.fontSize = '13px';
      expl.style.marginTop = '8px';
      expl.style.color = 'var(--ink-soft)';
      expl.textContent = q.explanation;
      card.appendChild(expl);
    });
    const banner = document.createElement('div');
    banner.className = 'score-banner';
    banner.textContent = `Score: ${score} / ${questions.length} (SSC CHSL marking: +1 correct, -0.50 wrong)`;
    mockOutput.prepend(banner);
    checkBtn.disabled = true;
  };
  mockOutput.appendChild(checkBtn);
}

// ---------- SAVED (localStorage) ----------
function saveNote(text){
  const notes = JSON.parse(localStorage.getItem('prahari_saved') || '[]');
  notes.unshift({ text, date: new Date().toLocaleString() });
  localStorage.setItem('prahari_saved', JSON.stringify(notes));
}

function renderSaved(){
  const list = document.getElementById('saved-list');
  const notes = JSON.parse(localStorage.getItem('prahari_saved') || '[]');
  if(!notes.length){
    list.innerHTML = '<p class="empty-state">Nothing saved yet — tap "Save" under any chat reply to keep it here.</p>';
    return;
  }
  list.innerHTML = '';
  notes.forEach((note, i) => {
    const item = document.createElement('div');
    item.className = 'saved-item';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = note.date;
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = 'Delete';
    del.onclick = () => {
      notes.splice(i, 1);
      localStorage.setItem('prahari_saved', JSON.stringify(notes));
      renderSaved();
    };
    meta.appendChild(date);
    meta.appendChild(del);
    item.appendChild(meta);
    const body = document.createElement('div');
    body.innerHTML = renderMarkdown(note.text);
    item.appendChild(body);
    list.appendChild(item);
  });
}
