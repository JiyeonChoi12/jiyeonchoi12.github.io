import {createEnglishBook} from './english.js';
import {paperItems, paperSubject, paperLabel, paperCard, correctPaperChoice, loadFragment, pageViewer, changeOriginalPage} from './paper-bank.js';
const STORAGE_KEY = 'gosi-2028-starter-v1';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABELS = {dashboard:'학습 대시보드',textbook:'기본서',english:'영어 교재',bank:'기출 문제은행',reference:'자료집 · 단어장',bookmarks:'북마크',wrong:'오답노트',verification:'출처 · 검수'};
const examLabel = {'national-9':'국가직 9급','local-9':'지방직 9급','national-7':'국가직 7급'};
const allSubjects = {computer:'컴퓨터일반',security:'정보보호론',english:'영어',korean:'국어'};
const defaults = {bookmarks:[],wrongIds:[],attempts:[],retryIds:[],selections:{},englishMarks:{},demo:false};
let local = loadLocal();
let realQuestions = [], demoQuestions = [], concepts=[], references=[], words=[];
let activePage = 'bank';
let practiceScope = 'graded';
let randomOrder = [];
let randomPositions=new Map();
let papers = [], originals = [], cursor = 0;
let bankPool = [];
let englishBook;

function loadLocal() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!value || typeof value !== 'object') return structuredClone(defaults);
    return {...structuredClone(defaults),...value};
  } catch { return structuredClone(defaults); }
}
function creditVoidedAttempts() {
  const voidIds = new Set(originals.filter(q => q.noAnswer).map(q => q.id));
  let changed = false;
  for (const attempt of local.attempts) {
    if (voidIds.has(attempt.id) && !attempt.correct) {
      attempt.correct = true;
      changed = true;
    }
  }
  const remaining = local.wrongIds.filter(id => !voidIds.has(id));
  if (remaining.length !== local.wrongIds.length) {
    local.wrongIds = remaining;
    changed = true;
  }
  return changed;
}
function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
}
async function readJson(path) {
  if(window.studyData && path in window.studyData) return window.studyData[path];
  const response=await fetch(path, {cache:'no-store'});
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
}
async function readTextbooks() {
  const books = await Promise.all([readJson('./data/concepts.json'),readJson('./data/security-concepts.json')]);
  return books.flat();
}
function activeQuestions() { return local.demo ? demoQuestions : bankPool; }
function knownQuestions() { return [...realQuestions,...demoQuestions]; }
function isSaved(qid) { return local.bookmarks.includes(qid); }
function hasWrong(qid) { return local.wrongIds.includes(qid); }
function latestAttempt(qid) { return local.retryIds.includes(qid) ? null : [...local.attempts].reverse().find(a => a.id === qid); }
function availableChoices(q) { return Array.isArray(q.choices) ? q.choices : []; }

function navigate(page) {
  activePage=page;
  const url = new URL(location.href);
  if (page === 'english' || page === 'textbook' || /^#(?:textbook|english)(?:\/|$)/.test(url.hash)) {
    url.hash = page === 'english' ? englishBook?.route() || 'english' : page === 'textbook' ? 'textbook'+(concepts[bookIndex]?'/'+concepts[bookIndex].id:'') : '';
    if (url.href !== location.href) history.replaceState(history.state,'',url.href);
  }
  $$('.view').forEach(view=>view.classList.toggle('active',view.dataset.view === page));
  $$('.nav').forEach(nav=>nav.classList.toggle('active',nav.dataset.page === page));
  $('#page-title').textContent=LABELS[page] || LABELS.dashboard;
  refresh();
}
function refresh(){
  renderStats(); renderBadgeCounts();
  if(activePage==='bank') renderBank();
  if(activePage==='bookmarks') renderSubset('bookmark-list',local.bookmarks);
  if(activePage==='wrong') renderSubset('wrong-list',local.wrongIds);
  if(activePage==='textbook') renderBook();
  if(activePage==='english') {
    if (bookQuestion) {renderQuestions('#book-question',[bookQuestion],''); englishBook?.addPassage($('#book-question'),bookQuestion);}
    else englishBook?.render();
  }
  if(activePage==='reference') renderResources('reference-list',[...references,...words],'자료집');
  if(activePage==='verification') renderVerification();
}
function renderStats(){
  const solved=new Set(local.attempts.map(x=>x.id)).size;
  const correct=local.attempts.filter(x=>x.correct).length;
  const rate=local.attempts.length?Math.round(correct*100/local.attempts.length):0;
  const items=[['수록 기출',bankPool.length.toLocaleString('ko-KR')+'문항'],['푼 문제 수',solved+'문항'],['누적 정답률',rate+'%'],['오답노트',local.wrongIds.length+'문항']];
  $('#stats').innerHTML=items.map(([title,value])=>`<div class="stat"><div class="caption">${escapeHtml(title)}</div><div class="value">${escapeHtml(value)}</div></div>`).join('');
}
function renderBadgeCounts(){
  $('#bookmark-count').textContent=local.bookmarks.length||'';
  $('#wrong-count').textContent=local.wrongIds.length||'';
}
function updateDetailOptions(){
  cursor=0;
  const mode=$('#mode-filter').value;
  const selected=$('#detail-filter').value;
  $('#detail-label').textContent=mode==='year'?'연도':'주제';
  let subset=activeQuestions().filter(q=>($('#subject-filter').value==='all'||q.subject===$('#subject-filter').value) && ($('#exam-filter').value==='all'||q.exam===$('#exam-filter').value));
  let options=mode==='year'?
    [...new Set(subset.map(q=>Number(q.year)))].sort((a,b)=>b-a).map(v=>({value:String(v),label:v+'년'})):
    [...new Map(subset.map(q=>[q.topic_id,{value:q.topic_id,label:q.topic_label||q.topic_id}])).values()].sort((a,b)=>a.label.localeCompare(b.label,'ko'));
  $('#detail-filter').innerHTML=`<option value="all">${mode==='year'?'전체 연도':'전체 주제'}</option>`+options.map(o=>`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  $('#detail-filter').value=options.some(o=>o.value===selected)?selected:'all';
}
function filteredQuestions(){
  const subject=$('#subject-filter').value,exam=$('#exam-filter').value,mode=$('#mode-filter').value,detail=$('#detail-filter').value;
  const items=activeQuestions().filter(q=>(subject==='all'||q.subject===subject)&&(exam==='all'||q.exam===exam)&&(detail==='all'||(mode==='year'?String(q.year)===detail:q.topic_id===detail)));
  if ($('#order-filter').value==='random') {
    const ids=new Set(items.map(q=>q.id));
    if(randomOrder.length!==items.length || randomOrder.some(id=>!ids.has(id))){
      randomOrder=[...ids];
      for(let i=randomOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[randomOrder[i],randomOrder[j]]=[randomOrder[j],randomOrder[i]];}
      randomPositions=new Map(randomOrder.map((id,i)=>[id,i]));
    }
    return items.sort((a,b)=>randomPositions.get(a.id)-randomPositions.get(b.id));
  }
  return items.sort((a,b)=>b.year-a.year || (a.exam||'').localeCompare(b.exam||'') || (a.paper?.subject||a.subject).localeCompare(b.paper?.subject||b.subject,'ko') || (a.booklet||'').localeCompare(b.booklet||'','ko') || Number(a.number||0)-Number(b.number||0));
}
function renderBank(){
  $('#demo-toggle').checked=!!local.demo;
  const matchingPapers=papers.filter(p=>
    ($('#subject-filter').value==='all'||paperSubject(p)===$('#subject-filter').value) &&
    ($('#exam-filter').value==='all'||p.exam===$('#exam-filter').value) &&
    ($('#mode-filter').value!=='year'||$('#detail-filter').value==='all'||String(p.year)===$('#detail-filter').value));
  const select=$('#paper-filter'), prior=select.value;
  select.innerHTML='<option value="all">전체 시험지</option>'+matchingPapers.map(p=>
    '<option value="'+p.id+'">'+escapeHtml(paperLabel(p))+'</option>').join('');
  select.value=matchingPapers.some(p=>p.id===prior)?prior:'all';
  $('#paper-field').hidden=!!local.demo;
  const gradedOnly = !local.demo && practiceScope === 'graded';
  $('.study-modes').hidden = !!local.demo;
  for (const button of $$('[data-scope]')) {
    button.setAttribute('aria-pressed', String(button.dataset.scope === practiceScope));
  }
  const questions = filteredQuestions().filter(q =>
    (local.demo || select.value === 'all' || q.paper?.id === select.value) &&
    (!gradedOnly || !q.paper || q.answers.length || q.noAnswer)
  );
  $('#question-map').hidden = true;
  const paper=matchingPapers.find(p=>p.id===select.value);
  $('#paper-library').innerHTML=!local.demo && paper && !paper.count ?
    '<article class="question-card"><h3>'+escapeHtml(paperLabel(paper))+'</h3><p>문항 구분 검토 중 · 원문 전체를 볼 수 있어요.</p>'+pageViewer(paper)+'</article>':'';
  const pager=$('#paper-pager');
  pager.innerHTML='';
  if(!local.demo && questions.length) {
    cursor=Math.max(0,Math.min(cursor,questions.length-1));
    const q=questions[cursor];
    pager.innerHTML = '<button class="btn secondary small" data-step="-1" '+(cursor===0?'disabled':'')+'>이전</button>'+
      '<span>'+(cursor+1).toLocaleString('ko-KR')+' / '+questions.length.toLocaleString('ko-KR')+'</span>'+
      '<button class="btn secondary small" data-step="1" '+(cursor===questions.length-1?'disabled':'')+'>다음</button>';
    $('#result-count').textContent = questions.length.toLocaleString('ko-KR')+'문항';
    if (q.paper) renderQuestionMap(q, questions);
    renderQuestions('#question-list',[q],'');
    return;
  }
  if(paper && !paper.count && !local.demo){$('#result-count').textContent='원문 열람';$('#question-list').innerHTML='';return;}
  $('#result-count').textContent=`${questions.length}문항 · ${local.demo?'기능 확인용 가상 문제':'검증 완료된 실제 기출만 표시'}`;
  renderQuestions('#question-list',questions,local.demo?'원하는 과목·연도 조건에 해당하는 데모 문항이 없어.':'선택한 조건에 맞는 문항이 없습니다. 전체 문항을 선택하거나 필터를 변경하세요.');
}
function renderQuestionMap(current, questions) {
  const map = $('#question-map');
  const positions = new Map();
  questions.forEach((q, index) => {
    if (q.paper === current.paper) positions.set(q.number, index);
  });
  let solved = 0;
  const cells = current.paper.items.map((_, i) => {
    const number = i + 1;
    const index = positions.get(number);
    const attempt = latestAttempt('paper-'+current.paper.id+'-'+number);
    if (attempt) solved++;
    const status = attempt ? (attempt.correct ? '정답' : '오답') : '미풀이';
    const symbol = attempt ? (attempt.correct ? '✓' : '×') : '';
    return '<button data-index="'+(index ?? '')+'" '+(index === undefined ? 'disabled' : '')+
      (number === current.number ? ' aria-current="step"' : '')+
      ' aria-label="'+number+'번 '+status+'" class="'+(attempt ? (attempt.correct ? 'right' : 'missed') : '')+'">'+
      number+'<small aria-hidden="true">'+symbol+'</small></button>';
  });
  map.hidden = false;
  map.innerHTML = '<h3>문항 이동</h3><p>'+escapeHtml(paperLabel(current.paper))+'</p>'+
    '<div class="map-grid">'+cells.join('')+'</div><div class="map-score">풀이 완료 <strong>'+
    solved+' / '+current.paper.items.length+'</strong></div>';
}
function renderSubset(target,ids){
  const pool=new Map(activeQuestions().map(q=>[q.id,q]));
  const matched=ids.map(id=>pool.get(id)).filter(Boolean);
  const hidden=ids.length-matched.length;
  renderQuestions('#'+target,matched,ids.length?(hidden?`${hidden}건은 현재 ${local.demo?'정식':'데모'} 모드에서 숨겨져 있어. 문제은행에서 모드를 전환해 봐.`:'아직 표시할 수 있는 문제가 없어.'):'저장된 문제가 아직 없어. 문제은행에서 문제를 풀거나 북마크를 눌러 봐.');
}
function renderQuestions(selector,questions,emptyMessage){
  const list=$(selector);
  if(!questions.length){list.innerHTML=`<div class="empty"><strong>표시할 문제가 없어</strong>${escapeHtml(emptyMessage)}</div>`;return;}
  list.innerHTML=questions.map(q=>{
    const attempt=latestAttempt(q.id);
    if(q.paper) return paperCard(q,attempt,isSaved(q.id),hasWrong(q.id));
    const choiceButtons=availableChoices(q).map((choice,index)=>{
      const selected=attempt?.chosen===index;
      const className=attempt && index===q.answer_index?' correct':attempt && selected?' wrong':selected?' selected':'';
      const prefix=['①','②','③','④','⑤','⑥'][index]||`${index+1}.`;
      return `<button class="choice${className}" ${attempt?'disabled':''} data-answer-id="${escapeHtml(q.id)}" data-choice="${index}">${prefix} ${escapeHtml(choice)}</button>`;
    }).join('');
    const answer=attempt?`<div class="answer-note"><strong>${attempt.correct?'✓ 정답':'✕ 오답'} · 정답 ${q.answer_index+1}번</strong><div>${escapeHtml(q.explanation||'해설 검수 대기')}</div><small>정답 확인 결과: ${escapeHtml(new Date(attempt.date).toLocaleString('ko-KR'))}</small></div>`:'';
    const tag=q.verification?.status==='demo_only'?'<span class="tag demo">가상 문제 · 기출 아님</span>':`<span class="tag">${escapeHtml(q.verification?.status||'검수 안 됨')}</span>`;
    return `<article class="question-card" data-question-id="${escapeHtml(q.id)}"><div class="question-top"><span class="tag">${escapeHtml(q.subject_label||allSubjects[q.subject]||q.subject)}</span><span>${escapeHtml(examLabel[q.exam]||q.exam)} · ${escapeHtml(q.year)}년 · ${escapeHtml(q.booklet||'책형 미확인')} · ${escapeHtml(q.number)}번</span><span class="tag">${escapeHtml(q.topic_label||q.topic_id||'미분류')}</span>${tag}<button class="bookmark-toggle ${isSaved(q.id)?'saved':''}" data-bookmark-id="${escapeHtml(q.id)}" aria-label="북마크 저장 또는 해제" title="북마크">${isSaved(q.id)?'★':'☆'}</button></div><h3>${escapeHtml(q.stem)}</h3><div class="choices">${choiceButtons}</div><div class="question-actions">${attempt?`<button class="btn secondary small" data-retry-id="${escapeHtml(q.id)}">다시 풀기</button>`:''}${hasWrong(q.id)?`<button class="btn secondary small" data-clear-wrong="${escapeHtml(q.id)}">오답노트에서 해제</button>`:''}</div>${answer}<div class="question-source">출처: ${q.source?.kind==='synthetic_demo'?'직접 작성한 기능 테스트용 예제':escapeHtml(q.source?.url||'원문 확인 대기')} · ID ${escapeHtml(q.id)}</div></article>`;
  }).join('');
  for(const q of questions.filter(x=>x.paper)) loadFragment(q,list.querySelector('[data-paper-fragment="'+q.id+'"]'));
}
let bookIndex = 0;
let bookQuestion = null;

function diagramTable(diagram) {
  const e = escapeHtml;
  const hasRowLabels = diagram.rows.some(row => row[0]);
  const heads = diagram.cols.map(col => '<th scope="col">'+e(col)+'</th>').join('');
  const rows = diagram.rows.map(([label, ...cells],row) => '<tr>'+
    (hasRowLabels ? '<th scope="row">'+e(label)+'</th>' : '')+
    cells.map((cell,col) => '<td'+(diagram.highlight?.[0]===row && diagram.highlight[1]===col?' class="changed-cell"':'')+'>'+e(cell)+'</td>').join('')+'</tr>').join('');
  return '<figure class="book-diagram'+(diagram.cells?' memory-diagram':'')+'"><figcaption>'+e(diagram.title)+'</figcaption>'+
    '<div class="book-table-scroll" tabindex="0" role="region" aria-label="'+e(diagram.title)+'"><table><thead><tr>'+
    (hasRowLabels?'<td></td>':'')+heads+'</tr></thead><tbody>'+rows+'</tbody></table></div><p>'+e(diagram.note)+'</p></figure>';
}

function walkItem([kind, label, value, tag]) {
  const e = escapeHtml;
  const on = value === '1';
  const state = kind === 'lamp' ? (on ? '켜짐' : '꺼짐') : kind === 'switch' ? (on ? '누름' : '뗌') : '';
  return `<div class="walk-object ${tag?'marked':''}">
    <span class="object-label">${e(label)}</span>
    <span class="object-shape ${e(kind)} ${state && on?'is-on':''}"><b>${e(value)}</b></span>
    ${state || tag ? '<span class="object-tag">'+e(tag || state)+'</span>' : ''}
  </div>`;
}

function walkthrough(guide) {
  const e = escapeHtml;
  const panels = guide.steps.map((step,i)=>`<div class="walk-panel" ${i?'hidden':''}>
    <p class="walk-count">${i+1} / ${guide.steps.length}</p>
    <h5>${e(step.title)}</h5>
    <div class="walk-scene">${step.items.map(walkItem).join('')}</div>
    <p class="walk-caption">${e(step.caption)}</p>
  </div>`).join('');
  return `<figure class="book-walk"><figcaption>${e(guide.title)}</figcaption>
    <div aria-live="polite" aria-atomic="true">${panels}</div>
    <div class="walk-controls"><button type="button" data-walk-back disabled>← 이전</button>
    <button type="button" data-walk-next>${e(guide.steps[0].next)} →</button></div></figure>`;
}

function changeWalkStep(button) {
  const figure = button.closest('.book-walk');
  const steps = concepts[bookIndex].walkthrough.steps;
  const panels = [...figure.querySelectorAll('.walk-panel')];
  const current = panels.findIndex(panel=>!panel.hidden);
  const next = button.hasAttribute('data-walk-back') ? current-1 : (current+1)%steps.length;
  panels[current].hidden = true;
  panels[next].hidden = false;
  const back = figure.querySelector('[data-walk-back]');
  const forward = figure.querySelector('[data-walk-next]');
  back.disabled = next === 0;
  forward.textContent = steps[next].next ? steps[next].next+' →' : '처음부터 다시 보기';
  if (back.disabled && button === back) forward.focus();
}

function selectBookLesson(index) {
  bookIndex = index;
  navigate('textbook');
  $('#book-lesson h3').focus({preventScroll:true});
  $('#book-lesson').scrollIntoView({block:'start'});
}

function renderTermIndex(query) {
  const container = $('#book-term-results');
  if (!container) return;
  const needle = query.trim().toLocaleLowerCase('ko');
  const matches = [];
  for (const [index,lesson] of concepts.entries()) {
    if (lesson.subject !== concepts[bookIndex].subject) continue;
    for (const [term,meaning] of lesson.terms) {
      if ((term+' '+meaning).toLocaleLowerCase('ko').includes(needle)) matches.push({index,term,meaning,lesson});
    }
  }
  matches.sort((a,b)=>a.term.localeCompare(b.term,'ko'));
  $('#book-term-count').textContent = matches.length+'개 풀이';
  container.innerHTML = matches.map(({index,term,meaning,lesson})=>
    '<div><dt>'+escapeHtml(term)+'</dt><dd>'+escapeHtml(meaning)+' <button class="term-source" data-book-index="'+index+'">'+
      escapeHtml(lesson.title)+' 절 보기 →</button></dd></div>').join('') || '<p>다른 단어나 약자로 찾아보세요.</p>';
}

function renderBook() {
  if (bookQuestion) {
    renderQuestions('#book-question', [bookQuestion], '');
    return;
  }
  const lesson = concepts[bookIndex];
  if (!lesson) return;
  const e = escapeHtml;
  const number = index => String(index + 1).padStart(2,'0');
  const partLessons = concepts.map((section,index)=>({section,index})).filter(({section})=>section.subject===lesson.subject && section.part===lesson.part);
  const localIndex = partLessons.findIndex(({index})=>index===bookIndex);
  function setChoices(selector,values,current) {
    const select = $(selector);
    select.replaceChildren(...[...new Set(values)].map(value=>new Option(value,value,false,value===current)));
  }
  setChoices('#book-subject',[...concepts.map(section=>section.subject),'영어'],lesson.subject);
  setChoices('#book-part',concepts.filter(section=>section.subject===lesson.subject).map(section=>section.part),lesson.part);
  const [kind,partNumber,...title] = lesson.part.split(' ');
  $('#book-part-label').textContent = lesson.subject+' · '+kind+' '+partNumber;
  $('#book-part-title').textContent = title.join(' ');
  $('#book-sections').innerHTML = partLessons.map(({section,index},i) =>
    '<button data-book-index="'+index+'" '+(index===bookIndex?'aria-current="step"':'')+'><span>'+number(i)+'</span> '+e(section.title)+'</button>').join('');
  $('#book-select').innerHTML = partLessons.map(({section,index},i)=>
    '<option value="'+index+'" '+(index===bookIndex?'selected':'')+'>'+number(i)+' · '+e(section.title)+'</option>').join('');
  const formal = lesson.formal.map(([title,paragraphs])=>'<div class="exam-concept"><h5>'+e(title)+'</h5>'+
    paragraphs.map(body=>'<p>'+e(body)+'</p>').join('')+'</div>').join('');
  const terms = lesson.terms.map(([term,meaning])=>'<dt>'+e(term)+'</dt><dd>'+e(meaning)+'</dd>').join('');
  const targets = lesson.targets.map(({goal,questions})=>{
    const examples = questions.map(([paperId,num,caption])=>({
      q: originals.find(item=>item.id==='paper-'+paperId+'-'+num), caption
    })).filter(example=>example.q);
    const years = new Set(examples.filter(({q})=>q.paper.subject===lesson.subject && ['national-9','local-9'].includes(q.paper.exam)).map(({q})=>q.paper.year));
    return {goal,examples,yearCount:years.size};
  });
  const goals = targets.map(({goal,yearCount},i)=>'<li>'+e(goal)+
    (yearCount>=3?' <button class="frequency-link" data-evidence="'+i+'">빈출 · '+yearCount+'개 연도 ↘</button>':'')+'</li>').join('');
  const practice = targets.map(({goal,examples},i)=>!examples.length?'':'<div class="book-evidence"><h5 tabindex="-1" id="evidence-'+i+'">'+e(goal)+'</h5>'+
    examples.map(({q,caption})=>'<button class="book-practice" data-book-question="'+e(q.id)+'"><strong>'+e(caption)+'</strong><small>'+
      e(paperLabel(q.paper))+' · '+q.number+'번</small><span aria-hidden="true">→</span></button>').join('')+'</div>').join('');
  const sources = lesson.sources.map(([title,url])=>'<a href="'+e(url)+'" target="_blank" rel="noopener">'+e(title)+'</a>').join(' · ');
  const next = concepts[bookIndex+1];
  const termIndex = lesson.part.startsWith('부록 02 ') ?
    '<details class="book-term-index"><summary>정보보호론 전체 용어 찾기</summary><label>찾을 말 <input id="book-term-query" type="search" placeholder="예: 인증, MAC"></label><small id="book-term-count" aria-live="polite"></small><dl id="book-term-results"></dl></details>' : '';
  $('#book-lesson').innerHTML = '<header><p class="book-kicker">제 '+number(localIndex)+' 절</p><h3 tabindex="-1">'+e(lesson.title)+'</h3></header>'+
    '<aside class="book-targets" aria-label="이 절의 학습 우선순위"><strong>핵심 · 혼자 풀 수 있을 때까지</strong><ul>'+goals+'</ul></aside>'+
    termIndex+'<div class="book-easy"><h4>'+e(lesson.lead)+'</h4><p>'+e(lesson.story)+'</p></div>'+
    walkthrough(lesson.walkthrough)+
    '<details class="book-extend"><summary>'+e(lesson.expand)+'</summary>'+lesson.diagrams.map(diagramTable).join('')+'</details>'+
    '<section><h4>시험에서는 이렇게 읽어요</h4>'+formal+'</section>'+
    '<section class="book-check"><h4>스스로 확인하기</h4><p>'+e(lesson.quiz[0])+'</p><details><summary>답과 이유 보기</summary><p>'+e(lesson.quiz[1])+'</p></details></section>'+
    (practice?'<section><h4>이 개념이 나온 기출</h4>'+practice+
    '<p class="frequency-rule">이 과목의 9급 기출에서 같은 개념을 서로 다른 세 해 이상 확인하면 ‘빈출’로 표시합니다. 같은 해의 시험이나 책형은 한 해로 셉니다.</p></section>':'')+
    '<section class="book-glossary"><h4>한 번 읽기 · 용어의 말뜻</h4><p class="glossary-tip">한자 풀이와 영어 단어의 뜻은 개념을 떠올릴 정도로만 읽어 보세요.</p><dl>'+terms+'</dl></section>'+
    '<p class="book-sources"><strong>개념 확인 자료</strong> '+sources+'</p>'+
    (next?'<button class="book-next btn secondary" data-book-index="'+(bookIndex+1)+'">'+(next.part===lesson.part?'다음 절 · '+e(next.title):'다음 단원 · '+e(next.subject)+' '+e(next.part))+' →</button>':'');
  if (termIndex) {
    renderTermIndex('');
    $('#book-term-query').addEventListener('input',event=>renderTermIndex(event.target.value));
  }
}

function openStudyQuestion(q) {
  if (!q) return;
  bookQuestion = q;
  renderQuestions('#book-question',[q],'');
  englishBook?.addPassage($('#book-question'),q);
  const dialog = $('#book-dialog');
  dialog.showModal();
  dialog.scrollTop = 0;
}
function attachBookEvents() {
  const dialog = $('#book-dialog');
  let printDetail = null;
  window.addEventListener('beforeprint',()=>{
    if (activePage !== 'textbook') return;
    const detail = $('.book-extend');
    if (detail && !detail.open) {printDetail = detail; detail.open = true;}
  });
  window.addEventListener('afterprint',()=>{
    if (printDetail) {printDetail.open = false; printDetail = null;}
  });
  $('#book-select').addEventListener('change',event=>selectBookLesson(Number(event.target.value)));
  $('#book-subject').addEventListener('change',event=>event.target.value==='영어' ? navigate('english') : selectBookLesson(concepts.findIndex(lesson=>lesson.subject===event.target.value)));
  $('#book-part').addEventListener('change',event=>selectBookLesson(concepts.findIndex(lesson=>lesson.part===event.target.value && lesson.subject===concepts[bookIndex].subject)));
  $('[data-view="textbook"]').addEventListener('click',event=>{
    const evidence = event.target.closest('[data-evidence]');
    if (evidence) {
      const heading = document.getElementById('evidence-'+evidence.dataset.evidence);
      heading.focus({preventScroll:true});
      heading.scrollIntoView({block:'start'});
      return;
    }
    const step = event.target.closest('[data-walk-back], [data-walk-next]');
    if (step) {changeWalkStep(step);return;}
    const target = event.target.closest('[data-book-index], [data-book-question]');
    if (!target) return;
    if (target.hasAttribute('data-book-index')) {
      selectBookLesson(Number(target.dataset.bookIndex));
    } else {
      openStudyQuestion(originals.find(q=>q.id===target.dataset.bookQuestion));
    }
  });
  dialog.addEventListener('close',()=>{
    bookQuestion = null;
    $('#book-question').replaceChildren();
  });
}

function renderResources(target,arr,type){
  const el=$('#'+target);
  if(!arr.length){el.innerHTML=`<div class="empty"><strong>아직 등록된 ${escapeHtml(type)}가 없어</strong>원전 출처와 검수가 완료된 학습 자료만 정식으로 표시할 예정이야.<br>웹 기본서에서 인쇄 → PDF 저장을 통해 태블릿용 PDF로 만들 수 있어.</div>`;return;}
  el.innerHTML=arr.map(item=>`<article class="resource-card"><div class="meta">${escapeHtml(item.subject||'공통')} · ${escapeHtml(item.verification?.status||'미검수')}</div><h3>${escapeHtml(item.title||item.word||'자료')}</h3><div>${escapeHtml(item.body||item.meaning||'')}</div></article>`).join('');
}
function renderVerification(){
  const graded=papers.reduce((n,p)=>n+p.graded,0);
  const counts='<div class="verification-card"><h3>기출 원문</h3><p>시험지 '+papers.length+'개 · 문항 '+originals.length+'개 · 책형별 정답표 대조 '+graded+'문항</p><p>원문 풀이는 시행기관 정답표에 나온 과목·책형·번호로 채점합니다. 해설 검수는 별도로 기록합니다.</p></div>';
  const statuses={verified:0,draft:0,needs_review:0,needs_recheck:0};
  for(const q of realQuestions){const st=q.verification?.status||'draft';if(st in statuses)statuses[st]++}
  $('#verification-list').innerHTML=counts+`<div class="verification-card"><h3>학습 콘텐츠 검증 상태</h3><ul><li>검증 완료: <strong>${statuses.verified}</strong>건</li><li>초안: ${statuses.draft}건</li><li>검증 대기: ${statuses.needs_review}건</li><li>재검토: ${statuses.needs_recheck}건</li><li>기능 확인용 가상 문제: ${demoQuestions.length}건 (실제 기출과 별도)</li></ul><p>해설까지 검증한 문항은 별도 집계합니다.</p><p>원본 PDF는 <code>exams/</code>, 검수 메모는 <code>verification/</code>에 보관한다.</p></div>`;
}
function recordAnswer(id,choice){
  const q=bookQuestion?.id===id ? bookQuestion : (activePage==='english' ? originals : activeQuestions()).find(x=>x.id===id);
  if(!q||latestAttempt(id)||q.paper&&!q.answers.length&&!q.noAnswer) return;
  if (q.paper && (!Number.isInteger(choice) || choice < 0 || choice > 3)) return;
  const correct=q.paper?correctPaperChoice(q,choice):Number(q.answer_index)===choice;
  const a={id,chosen:choice,correct,date:new Date().toISOString(),demo:!q.paper && !!local.demo};
  local.attempts.push(a);
  local.retryIds=local.retryIds.filter(x=>x!==id);
  if(!a.correct&&!local.wrongIds.includes(id))local.wrongIds.push(id);
  saveLocal();refresh();
}
function onDataAction(event){
  const answer=event.target.closest('[data-answer-id]');
  if(answer){recordAnswer(answer.dataset.answerId,Number(answer.dataset.choice));return;}
  const bookmark=event.target.closest('[data-bookmark-id]');
  if(bookmark){const id=bookmark.dataset.bookmarkId;local.bookmarks=isSaved(id)?local.bookmarks.filter(x=>x!==id):[...local.bookmarks,id];saveLocal();refresh();return;}
  const retry=event.target.closest('[data-retry-id]');
  if(retry){const id=retry.dataset.retryId;if(!local.retryIds.includes(id))local.retryIds.push(id);saveLocal();refresh();return;}
  const clear=event.target.closest('[data-clear-wrong]');
  if(clear){local.wrongIds=local.wrongIds.filter(x=>x!==clear.dataset.clearWrong);saveLocal();refresh();}
}
function exportBackup(){
  const blob=new Blob([JSON.stringify({version:1,created_at:new Date().toISOString(),data:local},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`gosi-2028-learning-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importBackup(file){
  if(!file)return;
  try{
    const obj=JSON.parse(await file.text());
    if(obj.version!==1||!obj.data||!Array.isArray(obj.data.bookmarks)||!Array.isArray(obj.data.wrongIds)||!Array.isArray(obj.data.attempts))throw new Error('백업 구조가 맞지 않아.');
    if(!confirm('현재 브라우저의 학습 기록을 백업 내용으로 덮어쓸까?'))return;
    local={...structuredClone(defaults),...obj.data};
    creditVoidedAttempts();
    saveLocal();refresh();alert('복원이 완료되었어.');
  } catch(error){alert('복원에 실패했어: '+error.message)}
}
function attachEvents(){
  attachBookEvents();
  $('.study-modes').addEventListener('click', event => {
    const button = event.target.closest('[data-scope]');
    if (!button) return;
    practiceScope = button.dataset.scope;
    cursor = 0;
    renderBank();
  });
  $('#question-map').addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (!button || button.disabled) return;
    cursor = Number(button.dataset.index);
    renderBank();
    $('#question-map [aria-current]').focus();
  });
  $('#paper-filter').addEventListener('change',()=>{cursor=0;renderBank()});
  $('#paper-pager').addEventListener('click',event=>{const btn=event.target.closest('[data-step]');if(btn){cursor+=Number(btn.dataset.step);renderBank();}});
  document.addEventListener('change',e=>{if(e.target.matches('[data-paper-page]'))changeOriginalPage(e.target);});
  $$('.nav').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
  $$('[data-open-english]').forEach(button=>button.addEventListener('click',()=>{
    englishBook?.readRoute('english/words');
    navigate('english');
  }));
  $('#go-bank').addEventListener('click',()=>navigate('bank'));
  $$('[data-subject-shortcut]').forEach(button=>button.addEventListener('click',()=>{$('#subject-filter').value=button.dataset.subjectShortcut;navigate('bank');updateDetailOptions();renderBank()}));
  $('#demo-toggle').addEventListener('change',event=>{local.demo=event.target.checked;saveLocal();updateDetailOptions();refresh()});
  ['subject-filter','exam-filter','mode-filter'].forEach(id=>$('#'+id).addEventListener('change',()=>{updateDetailOptions();randomOrder=[];refresh()}));
  ['detail-filter','order-filter'].forEach(id=>$('#'+id).addEventListener('change',()=>{cursor=0;randomOrder=[];refresh()}));
  $('#reset-filters').addEventListener('click',()=>{for(const id of ['subject-filter','exam-filter','detail-filter','paper-filter'])$('#'+id).value='all';$('#mode-filter').value='year';$('#order-filter').value='source';updateDetailOptions();refresh()});
  document.addEventListener('click',onDataAction);
  $('#export-backup').addEventListener('click',exportBackup);
  $('#import-backup').addEventListener('change',e=>importBackup(e.target.files[0]));
  $('#print-questions').addEventListener('click',()=>window.print());
  $('#print-textbook').addEventListener('click',()=>window.print());
}
async function main(){
  try{[realQuestions,demoQuestions,concepts,references,words,papers]=await Promise.all([
    readJson('./data/questions.json'),readJson('../fixtures/demo_questions.json'),readTextbooks(),readJson('./data/references.json'),readJson('./data/words.json'),readJson('./data/papers.json')
  ]);
    originals=paperItems(papers);
    if (creditVoidedAttempts()) saveLocal();
    bankPool=[...realQuestions.filter(q=>q.verification?.status==='verified'),...originals];
    $('#bank-totals').innerHTML = '<div><strong>'+originals.length.toLocaleString('ko-KR')+'</strong><span>수록 문항</span></div>'+
      '<div><strong>'+papers.reduce((sum,p)=>sum+p.graded,0).toLocaleString('ko-KR')+'</strong><span>자동 채점 가능</span></div>';
    const select=$('#subject-filter');
    const subjects=new Map(papers.map(p=>[paperSubject(p),p.subject]));
    for(const [id,name] of subjects)if(![...select.options].some(o=>o.value===id))select.add(new Option(name,id));
  }catch(error){console.error(error);$('.notice').hidden=false;$('.notice').innerHTML=`<strong>데이터 로딩 실패.</strong> 로컬 서버를 실행했는지 확인해 줘. ${escapeHtml(error.message)}`;}
  function openLocation() {
    if (/^#english(?:\/|$)/.test(location.hash) && englishBook) {
      englishBook.readRoute(location.hash.slice(1));
      navigate('english');return;
    }
    const match = /^#textbook(?:\/([^/]+))?$/.exec(location.hash);
    if (match) bookIndex = Math.max(0,concepts.findIndex(lesson=>lesson.id===match[1]));
    navigate(match?'textbook':'bank');
  }
  try {
    const [coreWords,patterns,everyday,grammar,reading,index,stories,sentences,frames,foundation,occurrences] = await Promise.all(
      ['words','patterns','everyday','grammar','reading','index','original-reading','sentences','verb-frames','foundation','occurrences'].map(name=>readJson('./data/english-'+name+'.json')));
    const vocabulary=[...patterns,...everyday,...coreWords.map(w=>({category:'기본 단어·숙어',...w}))];
    englishBook=createEnglishBook({root:$('#english-book'),vocabulary,foundation,frames,occurrences,grammar,reading,index,stories,sentences,
      questions:originals, escapeHtml, paperLabel, renderQuestions, openStudyQuestion, latestAttempt,
      getMarks:()=>local.englishMarks || {}, setMark:(id,mark)=>{
        local.englishMarks={...local.englishMarks,[id]:mark}; saveLocal();
      }});
  } catch (error) {
    $('#english-book').textContent='영어 교재를 불러오지 못했습니다. 새로고침해 주세요.';
    console.error(error);
  }
  attachEvents();updateDetailOptions();openLocation();
  window.addEventListener('hashchange',openLocation);
}
main();
