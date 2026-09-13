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
  document.querySelectorAll('#mode-toggle .mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  thinkingMode = btn.dataset.mode;
});

let searchEnabled = false;
document.getElementById('search-toggle').addEventListener('click', (e) => {
  searchEnabled = !searchEnabled;
  e.target.classList.toggle('active', searchEnabled);
});

// ---------- streaming API call ----------
// Streams the reply and calls onChunk(partialTextSoFar) as it arrives.
// Resolves with the full final text once the stream ends.
async function streamAgent(messages, system = SYSTEM_PROMPT, onChunk = null, mode = null, search = null, maxTokens = null){
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, mode: mode || thinkingMode, search: search !== null ? search : searchEnabled, maxTokens })
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
      if(!jsonStr || jsonStr === '[DONE]') continue;
      try{
        const parsed = JSON.parse(jsonStr);
        const piece = parsed.choices?.[0]?.delta?.content || '';
        if(piece){
          fullText += piece;
          if(onChunk) onChunk(fullText);
        }
      }catch(e){ /* partial JSON mid-chunk — ignore and wait for more data */ }
    }
  }
  return fullText;
}

// Splits a "### Thinking" / "### Answer" structured reply and renders the
// Thinking part as a distinct, collapsible box separate from the answer.
function splitThinking(text){
  const thinkMatch = text.match(/^#{1,4}\s*Thinking:?\s*$/im);
  if(!thinkMatch) return { thinking: null, answer: text };
  const thinkStart = thinkMatch.index + thinkMatch[0].length;
  const rest = text.slice(thinkStart);
  const answerMatch = rest.match(/^#{1,4}\s*Answer:?\s*$/im);
  if(!answerMatch){
    return { thinking: rest.trim(), answer: '' };
  }
  const answerStart = thinkStart + answerMatch.index + answerMatch[0].length;
  return {
    thinking: text.slice(thinkStart, thinkStart + answerMatch.index).trim(),
    answer: text.slice(answerStart).trim()
  };
}

function renderWithThinking(text){
  const { thinking, answer } = splitThinking(text);
  if(thinking === null) return renderMarkdown(text);
  let html = `<details class="thinking-box" open><summary>💭 Thinking</summary>${renderMarkdown(thinking)}</details>`;
  if(answer) html += renderMarkdown(answer);
  return html;
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
  if(role === 'agent'){ body.innerHTML = renderWithThinking(text); }
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
      body.innerHTML = renderWithThinking(partial);
      thread.scrollTop = thread.scrollHeight;
    });
    const finalText = fullText || "I couldn't generate a reply — try again.";
    body.innerHTML = renderWithThinking(finalText);
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
      digestOutput.innerHTML = renderWithThinking(partial);
    }, 'deep', true);
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
const mockSundayBtn = document.getElementById('mock-sunday');

function tokenBudgetFor(count){
  return Math.min(32000, count * 260 + 1000);
}

function buildMockPrompt(count, difficultyLabel){
  return `Generate ${count} SSC CHSL-level practice MCQs as self-study practice material (clearly not real exam questions). Difficulty level: ${difficultyLabel}. Regardless of level, phrase and structure every question like a genuine SSC CHSL Previous Year Question (PYQ) — matching the real toughness, trickiness, and exact phrasing style seen in actual past SSC CHSL papers, not simplified textbook-style questions. Distribute questions roughly evenly across these four SSC CHSL sections: Math (Quantitative Aptitude), Reasoning (General Intelligence), English (Language), and GK/GS (General Knowledge/General Awareness) — tag each question with which section it belongs to. Write each question and its options and explanation in BOTH English and Bengali.
IMPORTANT: explanations must be final and clean — 1-2 confident sentences per language. Do NOT show your reasoning process, self-corrections, or words like "wait", "correction", "actually let me reconsider" — work out the right answer silently and only write the finished explanation.
Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{"questions":[{"category":"Math","question_en":"...","question_bn":"...","options_en":["A","B","C","D"],"options_bn":["A","B","C","D"],"answer_index":0,"explanation_en":"...","explanation_bn":"..."}]}
(category must be exactly one of: "Math", "Reasoning", "English", "GK/GS")`;
}

async function generateOneSet(count, difficultyLabel, targetContainer, setLabel){
  const statusEl = document.createElement('p');
  statusEl.className = 'empty-state';
  statusEl.textContent = setLabel ? `Generating ${setLabel}…` : 'Generating your mock set…';
  targetContainer.appendChild(statusEl);

  try{
    const raw = await streamAgent(
      [{ role: 'user', content: buildMockPrompt(count, difficultyLabel) }],
      SYSTEM_PROMPT,
      (partial) => { statusEl.textContent = (setLabel ? `Generating ${setLabel}… ` : 'Generating… ') + `(${partial.length} chars so far)`; },
      'deep',
      false,
      tokenBudgetFor(count)
    );
    statusEl.remove();
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    renderQuiz(parsed.questions || [], targetContainer, setLabel);
  }catch(err){
    statusEl.textContent = `Couldn't generate ${setLabel || 'the mock set'}: ${err.message}`;
  }
}

mockGenerateBtn.addEventListener('click', async () => {
  const count = Number(document.getElementById('mock-count').value);
  mockOutput.innerHTML = '';
  mockGenerateBtn.disabled = true;
  mockSundayBtn.disabled = true;
  await generateOneSet(count, 'PYQ-level difficulty, matching real past SSC CHSL exam toughness', mockOutput, null);
  mockGenerateBtn.disabled = false;
  mockSundayBtn.disabled = false;
});

mockSundayBtn.addEventListener('click', async () => {
  const count = Number(document.getElementById('mock-count').value);
  mockOutput.innerHTML = '';
  mockGenerateBtn.disabled = true;
  mockSundayBtn.disabled = true;
  const difficulties = [
    'easy — warm-up level',
    'easy-medium',
    'medium',
    'medium-hard',
    'hardest — maximum SSC CHSL difficulty'
  ];
  for(let i = 0; i < difficulties.length; i++){
    const header = document.createElement('h3');
    header.textContent = `Set ${i + 1} of 5 — ${difficulties[i]}`;
    header.style.marginTop = i === 0 ? '0' : '28px';
    mockOutput.appendChild(header);
    await generateOneSet(count, difficulties[i], mockOutput, `Set ${i + 1}`);
  }
  mockGenerateBtn.disabled = false;
  mockSundayBtn.disabled = false;
});

function renderQuiz(questions, container, setLabel){
  if(!questions.length){
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = `No questions came back${setLabel ? ' for ' + setLabel : ''} — try again.`;
    container.appendChild(p);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'quiz-wrap';
  container.appendChild(wrap);

  const answers = new Array(questions.length).fill(null); // null = skipped, else option index
  let current = 0;
  const quizStartTime = Date.now();

  function renderStep(){
    wrap.innerHTML = '';

    if(current >= questions.length){
      renderSummary();
      return;
    }

    const q = questions[current];

    const progress = document.createElement('div');
    progress.className = 'quiz-progress';
    progress.textContent = `${setLabel ? setLabel + ' — ' : ''}Question ${current + 1} of ${questions.length}`;
    wrap.appendChild(progress);

    const card = document.createElement('div');
    card.className = 'q-card';
    const qText = document.createElement('p');
    qText.className = 'q-text';
    qText.innerHTML = `${q.question_en || q.question}<br><span style="font-weight:400;color:var(--ink-soft);">${q.question_bn || ''}</span>`;
    card.appendChild(qText);

    const optionsEn = q.options_en || q.options || [];
    const optionsBn = q.options_bn || [];
    optionsEn.forEach((opt, oi) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="option-dot"></span> ${opt}${optionsBn[oi] ? ` <span class="option-bn">(${optionsBn[oi]})</span>` : ''}`;
      btn.onclick = () => {
        answers[current] = oi;
        current += 1;
        renderStep();
      };
      card.appendChild(btn);
    });

    wrap.appendChild(card);

    const controls = document.createElement('div');
    controls.className = 'quiz-controls';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'primary-btn skip-btn';
    skipBtn.textContent = 'Skip question';
    skipBtn.onclick = () => {
      answers[current] = null;
      current += 1;
      renderStep();
    };
    controls.appendChild(skipBtn);
    wrap.appendChild(controls);

    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSummary(){
    const quizEndTime = Date.now();
    const elapsedSec = Math.round((quizEndTime - quizStartTime) / 1000);
    const mm = Math.floor(elapsedSec / 60);
    const ss = elapsedSec % 60;
    const timeStr = `${mm}m ${ss.toString().padStart(2, '0')}s`;

    let score = 0;
    let attempted = 0;
    const categoryStats = {}; // { Math: {correct, attempted, total} }

    questions.forEach((q, qi) => {
      const cat = q.category || 'General';
      if(!categoryStats[cat]) categoryStats[cat] = { correct: 0, attempted: 0, total: 0 };
      categoryStats[cat].total += 1;

      if(answers[qi] === null) return;
      attempted += 1;
      categoryStats[cat].attempted += 1;
      if(answers[qi] === q.answer_index){ score += 1; categoryStats[cat].correct += 1; }
      else score -= 0.5;
    });

    const banner = document.createElement('div');
    banner.className = 'score-banner';
    banner.textContent = `${setLabel ? setLabel + ' — ' : ''}Score: ${score} / ${questions.length} · Attempted ${attempted}/${questions.length} · Time: ${timeStr} (SSC CHSL marking: +1 correct, −0.50 wrong)`;
    wrap.appendChild(banner);

    // Category breakdown
    const catBox = document.createElement('div');
    catBox.className = 'q-card';
    const catTitle = document.createElement('p');
    catTitle.className = 'q-text';
    catTitle.textContent = 'Section-wise breakdown';
    catBox.appendChild(catTitle);
    let weakestCat = null;
    let weakestAccuracy = 2; // above max possible ratio, so first real value replaces it
    Object.entries(categoryStats).forEach(([cat, s]) => {
      const row = document.createElement('p');
      row.style.fontSize = '14px';
      row.style.margin = '4px 0';
