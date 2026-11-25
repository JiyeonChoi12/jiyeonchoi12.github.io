const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const labels = {'national-9':'국가직 9급', 'local-9':'지방직 9급', 'national-7':'국가직 7급'};
const codes = {'컴퓨터일반':'computer', '정보보호론':'security', '국어':'korean', '영어':'english'};
const details = new Map();
export const paperSubject = p => codes[p.subject] || p.subject;
export const paperLabel = p => [p.year+'년', labels[p.exam], p.subject, p.booklet].join(' ');

export function paperItems(papers) {
  return papers.flatMap(p => p.items.map(([page, answers], k) => ({
    id:'paper-'+p.id+'-'+(k+1), paper:p, number:k+1, subject:paperSubject(p), subject_label:p.subject,
    booklet:p.booklet, exam:p.exam, year:Number(p.year), page, answers,
    noAnswer:p.voids?.includes(k+1) || false,
    topic_id:'source', topic_label:'원문 기출'
  })));
}

function pageImage(paper, page) {
  return './data/papers/'+paper.id+'/p'+page+'.webp';
}

export function pageViewer(paper, initial=1) {
  const page = initial || 1;
  const options = Array.from({length:paper.pages}, (_, i) =>
    '<option value="'+(i+1)+'" '+(page===i+1?'selected':'')+'>'+(i+1)+'쪽</option>').join('');
  return '<div class="original-page"><label>원문 페이지 <select data-paper-page="'+paper.id+'">'+options+
    '</select></label><img loading="lazy" src="'+pageImage(paper,page)+'" alt="'+esc(paperLabel(paper))+' '+page+'쪽"></div>';
}

export function correctPaperChoice(q, choice) {
  return q.noAnswer ? Number.isInteger(choice) && choice >= 0 && choice < 4 : q.answers.includes(choice + 1);
}

export function paperCard(q, attempt, saved, wrong) {
  const p=q.paper;
  const choices = ['①','②','③','④'];
  const buttons=choices.map((label,i)=>{
    let mark='';
    if(attempt && correctPaperChoice(q,i)) mark=' correct';
    else if(attempt?.chosen===i) mark=' wrong';
    return '<button class="choice'+mark+'" data-answer-id="'+q.id+'" data-choice="'+i+'" '+
      (attempt||(!q.answers.length && !q.noAnswer)?'disabled':'')+'>'+label+'</button>';
  }).join('');
  let note = q.answers.length || q.noAnswer ? '' : '<p>이 책형의 정답 대조가 필요해 채점을 보류했어요.</p>';
  if(attempt) {
    const verdict = q.noAnswer ? '공식 정답 없음 · 모든 보기 정답 처리' : '정답 '+q.answers.join(', ')+'번';
    const source = q.noAnswer && p.ruling_url ? p.ruling_url : p.answer_url;
    note='<div class="answer-note"><strong>'+(attempt.correct?'✓ 정답':'✕ 오답')+
      ' · '+verdict+'</strong> <a target="_blank" rel="noopener" href="'+esc(source)+'">최종정답 확인</a></div>';
  }
  return '<article class="question-card" data-question-id="'+q.id+'"><div class="question-top"><span class="tag">'+
    esc(q.subject_label)+'</span><span>'+esc(paperLabel(p))+'</span><button class="bookmark-toggle '+(saved?'saved':'')+
    '" data-bookmark-id="'+q.id+'" aria-label="북마크 저장 또는 해제">'+(saved?'★':'☆')+'</button></div><h3>'+q.number+
    '번</h3><div data-paper-fragment="'+q.id+'"></div><details class="original"><summary>전체 지문 · 시험지 원문 보기</summary>'+pageViewer(p,q.page)+'</details><div class="number-choices">'+buttons+
    '</div>'+note+'<div class="question-actions">'+(attempt?'<button class="btn secondary small" data-retry-id="'+q.id+
    '">다시 풀기</button>':'')+(wrong?'<button class="btn secondary small" data-clear-wrong="'+q.id+
    '">오답노트에서 해제</button>':'')+'</div><div class="question-source"><a href="'+esc(p.source_page)+
    '" target="_blank" rel="noopener">시험 출처</a> · <a href="'+esc(p.source_url)+
    '" target="_blank" rel="noopener">문제지 PDF 받기</a></div></article>';
}

export async function loadFragment(q, container) {
  if(!q.page || !container) return;
  const id=q.paper.id;
  try {
    if(!details.has(id) && window.studyPaperDetails) details.set(id,window.studyPaperDetails[id]);
    if(!details.has(id)) details.set(id, fetch('./data/papers/'+id+'/paper.json').then(response=>{
      if(!response.ok) throw Error(response.status);
      return response.json();
    }));
    const detail=await details.get(id);
    const record=detail.questions[q.number-1];
    if(!container.isConnected || !record.position) return;
    const [left,top,width,height]=record.position;
    const img=new Image();
    img.alt=record.stem || (paperLabel(q.paper)+' '+q.number+'번');
    img.className='question-crop';
    img.onload=()=>{
      if(!container.isConnected) return;
      container.style.aspectRatio=(width*img.naturalWidth)/(height*img.naturalHeight);
      img.style.width=100/width+'%';
      img.style.left=-100*left/width+'%';
      img.style.top=-100*top/height+'%';
      container.replaceChildren(img);
    };
    img.src=pageImage(q.paper,q.page);
  } catch {
    details.delete(id);
    if(container.isConnected) container.textContent='문항을 불러오지 못했습니다. 아래에서 시험지 원문을 펼쳐 주세요.';
  }
}

export function changeOriginalPage(select) {
  const img=select.closest('.original-page').querySelector('img');
  img.src=pageImage({id:select.dataset.paperPage},Number(select.value));
  img.alt='시험지 원문 '+select.value+'쪽';
}
