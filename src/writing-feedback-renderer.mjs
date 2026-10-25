// English+ writing feedback renderer. Provider output is untrusted text.
// No network calls, HTML parsing, script insertion, or draft persistence.
const labels={
 taskCompletion:'تحقيق المطلوب',
 grammar:'القواعد',
 coherence:'الترابط',
 vocabulary:'المفردات'
};
const validText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function renderWritingFeedback(container,result){
 if(!container||typeof container.replaceChildren!=='function'||!container.ownerDocument?.createElement)
  throw new TypeError('A connected DOM container is required');
 const doc=container.ownerDocument;
 const write=(parent,tag,value)=>{
  const el=doc.createElement(tag);
  el.textContent=value;
  parent.append(el);
  return el;
 };
 const reject=()=>{
  const message=doc.createElement('p');
  message.textContent='تعذر عرض التقرير بسبب بيانات غير صالحة. لم تُرسل أي كتابة من هذه المعاينة.';
  container.replaceChildren(message);
  return false;
 };
 const f=result?.feedback;
 if(!f||typeof f!=='object'||Array.isArray(f)||
  !validText(f.summary,4000)||!validText(f.nextTask,4000)||
  !Array.isArray(f.strengths)||f.strengths.length>3||
  !f.strengths.every(s=>validText(s,1200))||
  !Array.isArray(f.corrections)||f.corrections.length>3||
  !f.corrections.every(c=>c&&typeof c==='object'&&!Array.isArray(c)&&
   ['original','suggestion','reason'].every(k=>validText(c[k],1500)))||
  !f.scores||typeof f.scores!=='object'||Array.isArray(f.scores)||
  !Object.keys(labels).every(k=>Number.isInteger(f.scores[k])&&f.scores[k]>=0&&f.scores[k]<=100))
  return reject();
 const section=doc.createElement('section');
 section.className='feedback-report';
 write(section,'h3','تقرير تعليمي — غير معتمد رسميًا');
 write(section,'p',f.summary);
 const scores=doc.createElement('dl');
 for(const [key,label] of Object.entries(labels)){
  write(scores,'dt',label);
  write(scores,'dd',String(f.scores[key])+' / 100');
 }
 section.append(scores);
 write(section,'h4','نقاط قوة');
 if(!f.strengths.length)write(section,'p','لم تُحدّد نقاط قوة في هذه المحاولة.');
 else{
  const ul=doc.createElement('ul');
  for(const strength of f.strengths)write(ul,'li',strength);
  section.append(ul);
 }
 write(section,'h4','تصحيحات مقترحة');
 if(!f.corrections.length)write(section,'p','لا توجد تصحيحات محددة في التقرير.');
 else{
  const ol=doc.createElement('ol');
  for(const c of f.corrections){
   const li=doc.createElement('li');
   write(li,'p','الأصل: '+c.original);
   write(li,'p','الاقتراح: '+c.suggestion);
   write(li,'p','السبب: '+c.reason);
   ol.append(li);
  }
  section.append(ol);
 }
 write(section,'h4','الخطوة التالية');
 write(section,'p',f.nextTask);
 write(section,'p','هذه تغذية راجعة تدريبية، وليست تقييمًا معتمدًا لمستوى اللغة.');
 container.replaceChildren(section);
 if(typeof container.setAttribute==='function')container.setAttribute('aria-live','polite');
 return true;
}
