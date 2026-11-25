export function createEnglishBook({root, vocabulary, foundation, frames, occurrences, grammar, reading, index, stories, sentences, questions,
  escapeHtml: e, paperLabel, renderQuestions, openStudyQuestion, latestAttempt, getMarks, setMark}) {
  const corpus=sentences.map(s=>({...s,title:s.en}));
  const books = {words:vocabulary, foundation, frames, sentences:corpus, stories, grammar, reading};
  const names = {words:'단어·숙어장', foundation:'기초 어휘장', frames:'동사·전치사 훈련', grammar:'문법 복습', sentences:'문장 연습', stories:'새 지문 독해', reading:'기출 독해', practice:'유형별 800제', review:'복습함'};
  const batches=[];
  const batchOf=new Map();
  for (const level of [...new Set(foundation.map(w=>w.level))]) {
    const entries=foundation.filter(w=>w.level===level);
    for (let offset=0;offset<entries.length;offset+=25) {
      const words=entries.slice(offset,offset+25);
      const batch={label:level+' · 묶음 '+(offset/25+1)+' ('+words[0].title+' ~ '+words.at(-1).title+')',words};
      batches.push(batch);
      words.forEach(w=>batchOf.set(w.id,batch));
    }
  }
  const relatedFrames=new Map();
  for (const frame of frames) {
    for (const wordId of frame.wordIds) {
      if (!relatedFrames.has(wordId)) relatedFrames.set(wordId,[]);
      relatedFrames.get(wordId).push(frame);
    }
  }
  const priorityOf=w=>w.priority||(w.refs.length||relatedFrames.has(w.id)?'먼저 익히기':'읽고 알아두기');
  const ratings = {again:'다시 보기', slow:'맞혔지만 느림', fluent:'바로 읽힘'};
  const qById = new Map(questions.filter(q=>q.subject==='english').map(q=>[q.id,q]));
  const question = (paper,number) => qById.get('paper-'+paper+'-'+number);
  const guided = new Map(reading.map(item=>[question(item.paper,item.number)?.id,item]));
  const practice = Object.entries(index).flatMap(([paper,types])=>types.map((type,i)=>({type,q:question(paper,i+1)})))
    .filter(item=>item.q).sort((a,b)=>b.q.year-a.q.year || a.q.exam.localeCompare(b.q.exam) || a.q.number-b.q.number);
  const types = [...new Set(practice.map(item=>item.type))];
  const byTerm = text=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
  const items = new Map(Object.entries(books).flatMap(([tab,list])=>list.map(item=>[tab+'/'+item.id,item])));
  let tab='words', id=vocabulary[0].id, type='', year='', selectedPractice='';
  const last=Object.fromEntries(Object.entries(books).map(([section,list])=>[section,list[0].id]));
  const filters={wordGroup:'',priority:'',frameGroup:'',storyType:'',level:'',topic:'',query:'',genre:''};
  let quickGrammar=true;
  function wordMatch(item) {
    return (!filters.wordGroup || item.category===filters.wordGroup) && (!filters.priority || priorityOf(item)===filters.priority);
  }
  const storyAnswers=new Map();
  function corpusMatch(item) {
    const needle=filters.query.trim().toLowerCase();
    return (!filters.topic || item.topics.includes(filters.topic)) && (!needle || (item.en+' '+item.ko).toLowerCase().includes(needle));
  }
  function storyMatch(item) {
    return (!filters.storyType || item.type===filters.storyType) && (!filters.level || item.level===filters.level);
  }
  let reviewFilter='due', reviewKey='', searchText='', readingType='';
  const route = ()=>['english',tab,id].filter(Boolean).join('/');
  function readRoute(hash) {
    const [,section,slug] = hash.split('/');
    tab=Object.hasOwn(names,section)?section:'words';
    id=books[tab]?.find(item=>item.id===slug)?.id || (books[tab]?last[tab]:'');
    if (id) last[tab]=id;
    const current=items.get(tab+'/'+id);
    if (tab==='words' && filters.wordGroup && current.category!==filters.wordGroup) filters.wordGroup='';
    if (tab==='words' && filters.priority && priorityOf(current)!==filters.priority) filters.priority='';
    if (tab==='frames' && filters.frameGroup && current.category!==filters.frameGroup) filters.frameGroup='';
    if (tab==='stories' && !storyMatch(current)) {filters.storyType='';filters.level='';}
    if (tab==='sentences' && !corpusMatch(current)) {filters.topic='';filters.query='';}
    if (tab==='reading' && readingType && items.get('reading/'+id)?.type!==readingType) readingType='';
    if (tab==='reading' && filters.genre && current.genre!==filters.genre) filters.genre='';
  }
  function go(section,slug) {
    readRoute('english/'+section+'/'+(slug||''));
    const url = new URL(location.href);
    url.hash=route();
    if (url.href!==location.href) history.pushState(history.state,'',url.href);
    render();
    root.querySelector('.eng-page-title')?.focus({preventScroll:true});
    root.scrollIntoView({block:'start'});
  }
  const link = (section,item,label)=>'<a class="eng-link" href="#english/'+section+'/'+e(item.id)+'">'+e(label||item.title)+'</a>';
  const paperName = q=>paperLabel(q.paper)+' · '+q.number+'번';
  const opt = (value,label,on)=>'<option value="'+e(value)+'"'+(on?' selected':'')+'>'+e(label)+'</option>';
  function refs(refs) {
    const qs=(refs||[]).map(r=>question(r.paper,r.number)).filter(Boolean);
    return qs.length?'<section class="eng-refs"><h4>연결 기출</h4>'+qs.map(q=>
      '<button class="eng-link" data-eng-paper="'+e(q.id)+'">'+e(paperName(q))+'</button>'+(guided.has(q.id)?link('reading',guided.get(q.id),'읽는 흐름 연습'): '')).join('')+'</section>':'';
  }
  function flow(lines) {
    return '<ol class="eng-flow">'+lines.map(line=>'<li>'+e(line)+'</li>').join('')+'</ol>';
  }
  function occurrenceLinks(item) {
    const term=item.title.toLowerCase();
    if (!Object.hasOwn(occurrences,term)) return '';
    const matches=occurrences[term].filter(([paper,number])=>
      !(item.refs||[]).some(r=>r.paper===paper && r.number===number));
    if (!matches.length) return '';
    return '<details class="eng-quiz"><summary>같은 단어가 쓰인 기출 본문</summary><div class="eng-refs">'+
      matches.map(([paper,number])=>question(paper,number)).filter(Boolean).map(q=>
        '<button class="eng-link" data-eng-paper="'+e(q.id)+'">'+e(paperName(q))+'</button>').join('')+'</div></details>';
  }
  function highlighted(example) {
    let result='', start=0;
    for (const part of example.focus||[]) {
      const pos=example.en.indexOf(part,start);
      if (pos<0) continue;
      result+=e(example.en.slice(start,pos))+'<strong>'+e(part)+'</strong>';
      start=pos+part.length;
    }
    return result+e(example.en.slice(start));
  }
  function gapForm(word,section='words') {
    return '<form class="eng-gap" data-eng-gap="'+e(section+'/'+word.id)+'"><h4>새 예문으로 빈칸 연습</h4>'+
      '<p lang="en">'+e(word.gap.en)+'</p><details><summary>뜻과 첫 글자 힌트</summary><p>'+e(word.gap.ko)+' · '+e(word.gap.answer[0])+'…</p></details><label>빈칸에 들어갈 표현 <input required autocomplete="off" autocapitalize="off" spellcheck="false" name="answer" aria-label="빈칸에 들어갈 영어 표현"></label> '+
      '<button class="btn secondary" type="submit">확인</button><p class="eng-feedback" role="status"></p></form>';
  }
  function quizForm(item) {
    return '<div class="eng-quiz"><h4>확인 문제</h4><p lang="en">'+e(item.quiz.prompt)+'</p>'+
      item.quiz.choices.map((c,i)=>'<button class="eng-choice" data-eng-quiz="'+e(item.id)+'" data-choice-index="'+i+'">'+e(c)+'</button>').join('')+
      '<p class="eng-feedback" role="status"></p></div>';
  }
  function extraExamples(item) {
    if (item.examples.length<=2) return '';
    return '<details class="eng-quiz"><summary>다른 문맥에서 더 읽기 · '+(item.examples.length-2)+'문장</summary>'+
      item.examples.slice(2).map(v=>'<div class="eng-example"><p lang="en">'+e(v.en)+'</p><details><summary>뜻 확인</summary><p>'+e(v.ko)+'</p></details></div>').join('')+'</details>';
  }
  function corpusLinks(item) {
    const pattern=item.title.toLowerCase();
    const phrase=' '+pattern+' ';
    const matches=corpus.filter(row=>(' '+row.en.toLowerCase().replace(/[^a-z'-]+/g,' ')+' ').includes(phrase)).slice(0,3);
    return matches.length?'<details class="eng-quiz"><summary>이 표현이 쓰인 공개 예문</summary>'+
      matches.map(row=>link('sentences',row)).join(' ')+'</details>':'';
  }
  function wordContent(item) {
    const units=relatedFrames.get(item.id)||[];
    return '<p class="eng-sub">'+e(item.category)+' · '+e(priorityOf(item))+'</p><p class="eng-meaning">'+e(item.meaning)+'</p>'+
      (units.length?'<div class="eng-refs">'+units.map(f=>link('frames',f,'이 동사·전치사로 세 문장 읽기')).join(' ')+'</div>':'')+
      '<section class="eng-example"><h4>첫 예문</h4><p lang="en">'+
      highlighted(item.examples[0])+'</p><p>'+e(item.examples[0].ko)+'</p></section>'+
      '<section class="eng-example"><h4>표시 없이 읽기</h4><p lang="en">'+e(item.examples[1].en)+
      '</p><details><summary>뜻 확인</summary><p>'+e(item.examples[1].ko)+'</p></details></section>'+
      '<details><summary>표현 풀이</summary><p>'+e(item.tip)+'</p></details>'+gapForm(item)+extraExamples(item)+corpusLinks(item)+refs(item.refs)+occurrenceLinks(item);
  }
  function frameContent(item) {
    const labels=['일상에서 읽기','업무에서 읽기','형태를 바꿔 읽기'];
    const words=item.wordIds.map(k=>items.get('words/'+k)).filter(Boolean);
    return '<p class="eng-meaning">'+e(item.meaning)+'</p><dl class="eng-roles">'+
      [['A',item.roleA],['B',item.roleB]].map(([key,value])=>'<div><dt>'+key+'</dt><dd>'+e(value)+'</dd></div>').join('')+'</dl>'+
      '<p>'+e(item.tip)+'</p>'+item.examples.map((ex,i)=>'<section class="eng-example"><h4>'+labels[i]+'</h4><p lang="en">'+e(ex.en)+
        '</p><details><summary>앞에서부터 읽은 뜻 확인</summary>'+flow(ex.flow)+'<p>'+e(ex.ko)+'</p></details></section>').join('')+
      gapForm(item,'frames')+(words.length?'<div class="eng-refs"><h4>단어장에서 다시 보기</h4>'+words.map(w=>link('words',w)).join(' ')+'</div>':'')+refs(item.refs);
  }
  function foundationContent(item,recall=false) {
    const cards=vocabulary.filter(w=>w.title.toLowerCase()===item.title.toLowerCase());
    return (recall?'<p class="eng-meaning" lang="en">'+e(item.title)+'</p>':'')+
      '<p class="eng-sub">'+e([item.level,item.group,item.pos].filter(Boolean).join(' · '))+'</p>'+
      '<details class="eng-example"><summary>대표 뜻 떠올린 뒤 확인</summary><p>'+e(item.meaning)+'</p></details>'+
      cards.map(w=>link('words',w,'예문과 빈칸으로 익히기')).join(' ')+corpusLinks(item)+occurrenceLinks(item)+
      '<p class="eng-sub"><a href="https://ko.wiktionary.org/wiki/'+encodeURIComponent(item.title)+'" target="_blank" rel="noopener">사전에서 다른 뜻 보기</a> · '+
      '<a href="./data/english-foundation-source.html" target="_blank" rel="noopener">기초 어휘 출처와 이용 조건</a></p>';
  }
  function corpusContent(item,recall=false) {
    const original=(id,author)=>'<a href="https://tatoeba.org/en/sentences/show/'+e(id)+'" target="_blank" rel="noopener">'+e(author)+' #'+e(id)+'</a>';
    return '<p class="eng-sub">'+item.topics.map(e).join(' · ')+'</p>'+
      (recall?'<p class="eng-meaning" lang="en">'+e(item.en)+'</p>':'')+
      '<details class="eng-example"><summary>한국어 번역 확인</summary><p>'+e(item.ko)+'</p></details>'+
      '<details class="eng-sentence-credit"><summary>예문 출처</summary><p>Tatoeba의 영어 문장과 한국어 번역을 원문 그대로 수록했습니다. 영어 '+
      original(item.enId,item.enAuthor)+' · 한국어 '+original(item.koId,item.koAuthor)+
      ' · <a href="https://creativecommons.org/licenses/by/2.0/fr/" target="_blank" rel="noopener">CC BY 2.0 FR</a></p></details>';
  }
  function storyContent(item) {
    const quiz=item.quiz, picked=storyAnswers.get(item.id);
    return '<p class="eng-sub">'+e(item.level)+' · '+e(item.type)+' · 창작 지문</p>'+
      '<div class="eng-passage-text" lang="en">'+item.passage.map(t=>'<p>'+e(t)+'</p>').join('')+'</div>'+
      '<section class="eng-quiz"><h4>'+e(quiz.prompt)+'</h4>'+quiz.choices.map((choice,i)=>
        '<button class="eng-choice" data-story="'+e(item.id)+'" data-choice-index="'+i+'" aria-pressed="'+(i===picked)+'">'+e(choice)+'</button>').join('')+
      '<p class="eng-feedback" role="status">'+(picked===undefined?'':(picked===quiz.answer?'정답이에요. ':'정답은 '+(quiz.answer+1)+'번입니다. ')+e(quiz.why))+'</p></section>'+
      '<details><summary>영어 순서대로 읽기</summary>'+flow(item.flow)+'</details><div class="eng-refs"><h4>이 지문에 쓰인 표현</h4>'+
      item.words.map(k=>items.get('words/'+k)).filter(Boolean).map(w=>link('words',w)+' <button class="btn secondary small" data-eng-save="'+e(w.id)+'">'+
        (getMarks()['words/'+w.id]?'복습함에 담김':'표현 담기')+'</button>').join('')+'</div>'+
      '<div class="eng-refs"><h4>같은 글 종류로 기출 풀기</h4>'+reading.filter(r=>r.genre===item.type).map(r=>link('reading',r)).join(' ')+'</div>';
  }
  function sectionPickers() {
    function picker(label,key,values) {
      return '<label>'+label+' <select data-eng-filter="'+key+'">'+opt('','전체',!filters[key])+
        [...new Set(values)].map(t=>opt(t,t,filters[key]===t)).join('')+'</select></label>';
    }
    if (tab==='words') return picker('학습 범위','wordGroup',vocabulary.map(x=>x.category))+
      picker('암기 우선순위','priority',['먼저 익히기','읽고 알아두기']);
    if (tab==='foundation') return '<label>수준별 어휘 묶음 <select data-eng-batch>'+batches.map(b=>opt(b.words[0].id,b.label,b===batchOf.get(id))).join('')+'</select></label>';
    if (tab==='frames') return picker('동사의 뜻','frameGroup',frames.map(x=>x.category));
    if (tab==='reading') return picker('글 종류','genre',reading.map(x=>x.genre));
    if (tab==='grammar') return '<label>복습 방식 <select data-eng-grammar-mode>'+opt('quick','먼저 풀고 기억 확인',quickGrammar)+opt('full','개념부터 읽기',!quickGrammar)+'</select></label>';
    if (tab==='stories') return picker('지문 종류','storyType',stories.map(x=>x.type))+picker('난이도','level',['기초','중급','도전']);
    if (tab==='sentences') return picker('연습 주제','topic',corpus.flatMap(x=>x.topics));
    return '';
  }
  function sentenceSearch() {
    return '<form class="eng-search-form" data-corpus-search><label>영어·한국어 문장 검색 <input name="query" type="search" value="'+e(filters.query)+'" placeholder="예: interested in"></label> '+
      '<button class="btn secondary">검색</button></form>';
  }
  function visibleItems() {
    if (tab==='words') return vocabulary.filter(wordMatch);
    if (tab==='foundation') return batchOf.get(id).words;
    if (tab==='frames' && filters.frameGroup) return frames.filter(f=>f.category===filters.frameGroup);
    if (tab==='sentences') return corpus.filter(corpusMatch);
    if (tab==='stories') return stories.filter(storyMatch);
    if (tab==='reading') return reading.filter(r=>(!readingType || r.type===readingType)&&(!filters.genre || r.genre===filters.genre));
    return books[tab];
  }
  function grammarContent(item) {
    const rule='<p class="eng-meaning">'+e(item.rule)+'</p><section class="eng-example"><h4>예문</h4><p lang="en">'+e(item.example.en)+
      '</p><details><summary>읽는 흐름과 뜻</summary>'+flow(item.flow)+'<p>'+e(item.example.ko)+'</p></details></section>';
    return (quickGrammar?quizForm(item)+'<details><summary>개념 다시 읽기</summary>'+rule+'</details>':rule+quizForm(item))+
      '<section class="eng-quiz"><h4>구문을 다른 문장에서 읽기</h4>'+(item.drills||[]).map(d=>'<div class="eng-example"><p lang="en">'+e(d.en)+
        '</p><details><summary>앞에서부터 뜻 확인</summary><p>'+e(d.cue)+'</p><p>'+e(d.ko)+'</p></details></div>').join('')+'</section>'+refs(item.refs);
  }
  function addPassage(container,q) {
    if (!q || q.year<2025 || q.year>2026 || q.subject!=='english' || q.number<6 || q.number>9) return;
    const card=container.querySelector('.question-card');
    if (!card || card.querySelector('.eng-passage')) return;
    const first=q.number<=7?6:8;
    const figure=document.createElement('figure');
    figure.className='eng-passage';
    figure.innerHTML='<figcaption>'+first+'–'+(first+1)+'번 공통 지문</figcaption><img alt="'+e(paperName(q))+' 공통 지문" src="./data/english-passages/'+e(q.paper.id)+'-'+first+'.webp">';
    card.querySelector('[data-paper-fragment]').before(figure);
  }
  function related(item) {
    const same = list=>list.filter(x=>(x.refs||[]).some(r=>r.paper===item.paper && r.number===item.number));
    const word = vocabulary.find(x=>byTerm(x.title)===byTerm(item.expression.en));
    const vocab=[...new Set([...(word?[word]:[]),...same(vocabulary)])];
    const rules=same(grammar), units=same(frames);
    return (vocab.length||rules.length||units.length)?'<div class="eng-refs"><h4>이 문제와 함께 복습</h4>'+
      vocab.map(x=>link('words',x)+' <button class="btn secondary small" data-eng-save="'+e(x.id)+'">'+(getMarks()['words/'+x.id]?'복습함에 담김':'표현 담기')+'</button>').concat(rules.map(x=>link('grammar',x)),units.map(x=>link('frames',x,'구문 훈련 · '+x.title))).join('')+'</div>':'';
  }
  function readingContent(item) {
    const q=question(item.paper,item.number);
    const attempt=latestAttempt(q.id);
    return '<p class="eng-sub">'+e(item.genre)+' · '+e(item.type)+' · '+e(paperName(q))+'</p><div id="eng-problem"></div>'+
      (attempt?'<details class="eng-analysis"><summary>읽는 흐름과 정답 근거</summary>'+flow(item.flow)+
        '<h4>정답 '+item.answer+'번을 고르는 근거</h4><p>'+e(item.evidence)+'</p><h4>헷갈리는 지점</h4><p>'+e(item.trap)+
        '</p><h4>기억할 표현</h4><p><b lang="en">'+e(item.expression.en)+'</b> · '+e(item.expression.ko)+'</p>'+related(item)+'</details>':
        '<p class="eng-sub">선지를 고르면 읽는 흐름과 정답 근거를 확인할 수 있어요.</p>');
  }
  function mountQuestion(q) {
    renderQuestions('#eng-problem',[q],'문항을 찾을 수 없습니다.');
    addPassage(root.querySelector('#eng-problem'),q);
  }
  function markKey(key,status) {
    const previous=getMarks()[key];
    const days=status==='again'?0:status==='slow'?1:Math.min(30,(previous?.status==='fluent'?(previous.days||3)*2:3));
    const due=new Date(); due.setDate(due.getDate()+days);
    setMark(key,{status,days,due:due.getTime(),reviews:(Number(previous?.reviews)||0)+(tab==='review'?1:0)});
  }
  function markButtons(key) {
    const mark=getMarks()[key];
    return '<div class="eng-ratings"><h4>이번에 읽은 느낌</h4>'+Object.entries(ratings).map(([value,label])=>
      '<button class="btn secondary small" data-eng-rating="'+value+'" data-key="'+e(key)+'" aria-pressed="'+(mark?.status===value)+'">'+label+'</button>').join(' ')+
      '<p class="eng-sub" role="status">'+(mark?'복습함에 저장됨 · '+(mark.days?new Date(mark.due).toLocaleDateString('ko-KR')+' 복습':'오늘 다시 보기'):'')+'</p></div>';
  }
  const title=(name,language='ko')=>'<h2 class="eng-page-title" tabindex="-1" lang="'+language+'">'+e(name)+'</h2>';
  const lessonBody={words:wordContent,foundation:foundationContent,frames:frameContent,grammar:grammarContent,
    sentences:corpusContent,stories:storyContent,reading:readingContent};
  function selection(list) {
    const typePicker=tab==='reading'?'<label>해설 유형 <select data-eng-reading-type>'+opt('','전체 유형',!readingType)+
      [...new Set(reading.map(r=>r.type))].map(t=>opt(t,t,t===readingType)).join('')+'</select></label>':'';
    const searchable=tab==='words'||tab==='foundation';
    if(tab==='sentences') return '<div class="eng-picker">'+sectionPickers()+sentenceSearch()+'</div>';
    return '<div class="eng-picker">'+sectionPickers()+typePicker+(list.length?'<label>목차 <select data-eng-select>'+list.map((v,i)=>opt(v.id,(i+1)+'. '+v.title,v.id===id)).join('')+'</select></label>':'')+
      (searchable?'<label>두 단어장 통합 검색 <input type="search" data-eng-search placeholder="영어 또는 뜻" value="'+e(searchText)+'"></label>':'')+'</div>'+
      (searchable?'<div class="eng-results" id="eng-results"></div>':'');
  }
  function showMatches() {
    const box=root.querySelector('#eng-results');
    if (!box) return;
    const needle=searchText.trim().toLowerCase();
    if (!needle) {box.innerHTML='';return;}
    const matches=['words','foundation'].flatMap(section=>books[section]
      .filter(x=>(x.title+' '+x.meaning).toLowerCase().includes(needle)).map(x=>({section,x})));
    matches.sort((a,b)=>Number(b.x.title.toLowerCase()===needle)-Number(a.x.title.toLowerCase()===needle));
    box.innerHTML=matches.length?'<p class="eng-search-count" role="status">'+matches.length+'개 검색됨'+(matches.length>30?' · 처음 30개 표시':'')+'</p>'+
      matches.slice(0,30).map(({section,x})=>link(section,x,x.title+' · '+x.meaning)).join(''):'찾은 표현이 없습니다.';
  }
  function lesson(list,item) {
    const pos=list.indexOf(item);
    const nextBatch=tab==='foundation'?batches[batches.indexOf(batchOf.get(id))+1]:null;
    return selection(list)+'<article class="eng-page"><p class="eng-kicker">'+names[tab]+' · '+(pos+1)+' / '+list.length+'</p>'+
      title(item.title,['words','foundation','frames','sentences'].includes(tab)?'en':'ko')+
      lessonBody[tab](item)+
      markButtons(tab+'/'+item.id)+'<nav class="eng-pager" aria-label="교재 넘기기">'+(pos?link(tab,list[pos-1],'이전'): '')+
      (tab==='sentences' && list.length>1?'<button class="btn secondary" data-sentence-shuffle>무작위 문장</button>':'')+
      (pos+1<list.length?link(tab,list[pos+1],tab==='sentences'?'다음 문장':'다음 · '+list[pos+1].title):nextBatch?link(tab,nextBatch.words[0],'다음 어휘 묶음'):'')+'</nav></article>';
  }
  function practicePage() {
    const subset=practice.filter(x=>(!type||type===x.type)&&(!year||String(x.q.year)===year));
    let current=subset.find(x=>x.q.id===selectedPractice)||subset[0];
    selectedPractice=current?.q.id||'';
    const years=[...new Set(practice.map(x=>String(x.q.year)))];
    const guide=guided.get(selectedPractice);
    const pos=subset.indexOf(current);
    return title('유형별 기출 연습')+'<p>같은 문항의 다른 책형을 합친 국가직·지방직 9급 영어 40세트입니다.</p><div class="eng-picker">'+
      '<label>출제 유형 <select data-eng-type>'+opt('','전체 유형',!type)+types.map(t=>opt(t,t,type===t)).join('')+'</select></label>'+
      '<label>연도 <select data-eng-year>'+opt('','전체 연도',!year)+years.map(y=>opt(y,y+'년',year===y)).join('')+'</select></label></div>'+
      (current?'<label class="eng-index-choice">기출 선택 · '+subset.length+'문항 <select data-eng-practice>'+subset.map(x=>opt(x.q.id,paperName(x.q)+' · '+x.type,x===current)).join('')+
      '</select></label><div id="eng-problem"></div>'+(guide?link('reading',guide,'이 문제의 독해 교재 열기'):'')+
      '<nav class="eng-pager" aria-label="문항 이동">'+[[-1,'이전 문항'],[1,'다음 문항']].map(([delta,label])=>'<button class="btn secondary" data-eng-jump="'+e(subset[pos+delta]?.q.id||'')+'" '+(subset[pos+delta]?'':'disabled')+'>'+label+'</button>').join('')+'</nav>':
      '<p>이 연도에 해당 유형으로 분류한 문항이 없습니다.</p>');
  }
  function recallExpression(item,mark,section) {
    const turn=(mark.reviews||0)%(item.examples.length+1);
    if (!turn) return gapForm(item,section);
    const example=item.examples[turn-1];
    return '<section class="eng-example"><h4>'+(turn%2===1?'영어를 읽고 뜻 떠올리기':'한국어를 보고 영어 표현 떠올리기')+'</h4>'+
      '<p>'+e(turn%2===1?example.en:example.ko)+'</p><details><summary>확인하기</summary><p>'+e(turn%2===1?example.ko:example.en)+'</p></details></section>';
  }
  function reviewPage() {
    const marks=getMarks(), now=Date.now();
    const saved=Object.entries(marks).filter(([k,m])=>items.has(k)&&m&&Object.hasOwn(ratings,m.status));
    const filtered=saved.filter(([,m])=>reviewFilter==='all'||(reviewFilter==='due'?m.due<=now:m.status===reviewFilter)).sort((a,b)=>a[1].due-b[1].due);
    if (!filtered.some(([k])=>k===reviewKey)) reviewKey=filtered[0]?.[0]||'';
    const item=items.get(reviewKey);
    const section=reviewKey.split('/')[0];
    function exercise() {
      if (section==='words'||section==='frames') return recallExpression(item,marks[reviewKey],section);
      if (section==='grammar') return quizForm(item);
      return lessonBody[section](item,true);
    }
    return title('복습함')+'<div class="eng-picker"><label>복습 범위 <select data-eng-review-filter>'+
      [['due','오늘 복습'],['slow','맞혔지만 느림'],['again','다시 보기'],['all','저장한 전체']].map(([k,v])=>opt(k,v,k===reviewFilter)).join('')+
      '</select></label>'+(item?'<label>복습 항목 · '+filtered.length+'개 <select data-eng-review>'+filtered.map(([k,m],i)=>opt(k,(reviewFilter==='due'?(i+1)+'. '+names[k.split('/')[0]]:items.get(k).title)+' · '+ratings[m.status],k===reviewKey)).join('')+'</select></label>':'')+
      '</div>'+(item?'<article class="eng-page"><p class="eng-kicker">'+names[section]+' 복습</p>'+
        exercise()+
        link(section,item,'본문에서 다시 읽기')+markButtons(reviewKey)+'</article>':
      '<p class="eng-empty">'+(saved.length?'이 범위에 해당하는 항목이 없습니다.':'공부한 뒤 ‘바로 읽힘’, ‘맞혔지만 느림’, ‘다시 보기’를 고르면 여기에 모입니다.')+'</p>');
  }
  function render() {
    const list=visibleItems(), item=list?.find(x=>x.id===id);
    const empty=list && !list.length?selection(list)+'<p>이 조건에 맞는 자료가 없습니다.</p>':'';
    root.innerHTML='<nav class="eng-tabs" aria-label="영어 교재 구성">'+Object.entries(names).map(([k,v])=>
      '<a href="#english/'+k+(last[k]?'/'+last[k]:'')+'" '+(tab===k?'aria-current="page"':'')+'>'+v+'</a>').join('')+'</nav>'+
      (empty || (item?lesson(list,item):tab==='review'?reviewPage():practicePage()));
    if (tab==='words'||tab==='foundation') showMatches();
    if (tab==='reading' && item) mountQuestion(question(item.paper,item.number));
    if (tab==='practice' && selectedPractice) mountQuestion(qById.get(selectedPractice));
    if (tab==='review' && reviewKey.startsWith('reading/')) {
      const r=items.get(reviewKey);mountQuestion(question(r.paper,r.number));
    }
  }
  root.addEventListener('click',event=>{
    const a=event.target.closest('a[href^="#english/"]');
    if (a && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      const [,section,slug]=a.hash.split('/');
      go(section,slug);return;
    }
    const button=event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-sentence-shuffle')) {
      const others=visibleItems().filter(v=>v.id!==id);
      if (others.length) go('sentences',others[Math.floor(Math.random()*others.length)].id);
      return;
    }
    if (button.dataset.story) {
      const item=items.get('stories/'+button.dataset.story);
      const picked=Number(button.dataset.choiceIndex);
      storyAnswers.set(item.id,picked);
      button.parentElement.querySelectorAll('[data-story]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      button.parentElement.querySelector('.eng-feedback').textContent=(picked===item.quiz.answer?'정답이에요. ':'정답은 '+(item.quiz.answer+1)+'번입니다. ')+item.quiz.why;
      return;
    }
    if (button.dataset.engSave) {
      const key='words/'+button.dataset.engSave;
      if (!getMarks()[key]) markKey(key,'again');
      button.textContent='복습함에 담김';return;
    }
    if (button.dataset.engPaper) {openStudyQuestion(qById.get(button.dataset.engPaper));return;}
    if (button.dataset.engJump) {selectedPractice=button.dataset.engJump;render();return;}
    if (button.dataset.engQuiz) {
      const item=items.get('grammar/'+button.dataset.engQuiz);
      const correct=Number(button.dataset.choiceIndex)===item.quiz.answer;
      button.parentElement.querySelector('.eng-feedback').textContent=(correct?'정답이에요. ':'정답은 '+item.quiz.choices[item.quiz.answer]+'입니다. ')+item.quiz.why;
    }
    if (button.dataset.engRating) {
      markKey(button.dataset.key,button.dataset.engRating);
      if (tab==='review') {reviewKey='';render();}
      else {
        const parent=button.closest('.eng-ratings');
        parent.outerHTML=markButtons(button.dataset.key);
        root.querySelector('[data-eng-rating="'+button.dataset.engRating+'"]')?.focus({preventScroll:true});
      }
    }
  });
  root.addEventListener('change',event=>{
    const el=event.target;
    if (el.dataset.engFilter) {
      filters[el.dataset.engFilter]=el.value;
      const first=visibleItems()[0];
      if(first) go(tab,first.id); else render();
      return;
    }
    if (el.matches('[data-eng-reading-type]')) {
      readingType=el.value;
      const first=visibleItems()[0];
      if(first) go(tab,first.id); else render();
      return;
    }
    if (el.matches('[data-eng-grammar-mode]')) {quickGrammar=el.value==='quick';render();return;}
    if (el.matches('[data-eng-batch]')) {go('foundation',el.value);return;}
    if (el.matches('[data-eng-select]')) {go(tab,el.value);return;}
    if (el.matches('[data-eng-type]')) type=el.value;
    else if (el.matches('[data-eng-year]')) year=el.value;
    else if (el.matches('[data-eng-practice]')) selectedPractice=el.value;
    else if (el.matches('[data-eng-review-filter]')) reviewFilter=el.value;
    else if (el.matches('[data-eng-review]')) reviewKey=el.value;
    else return;
    render();
  });
  root.addEventListener('input',event=>{
    if(event.target.matches('[data-eng-search]')) {searchText=event.target.value;showMatches();}
  });
  root.addEventListener('submit',event=>{
    if(event.target.matches('[data-corpus-search]')) {
      event.preventDefault();filters.query=event.target.elements.query.value.trim();
      const first=visibleItems()[0];if(first) go(tab,first.id); else render();return;
    }
    const form=event.target.closest('[data-eng-gap]');
    if (!form) return;
    event.preventDefault();
    const item=items.get(form.dataset.engGap);
    const normalize=value=>value.toLowerCase().trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ').replace(/[.!?]$/,'');
    const correct=normalize(form.elements.answer.value)===normalize(item.gap.answer);
    form.querySelector('.eng-feedback').textContent=(correct?'정답이에요. ':'이 문장에서 연습할 표현은 '+item.gap.answer+'입니다. ')+item.gap.ko;
  });
  return {route,readRoute,render,addPassage};
}

