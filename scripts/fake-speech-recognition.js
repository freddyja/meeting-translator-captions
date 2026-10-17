
window.__recs=[];
class FakeRec { constructor(){ this.lang=''; this.live=false; window.__recs.push(this);}
  start(){ if(this.live){const e=new Error('already started'); e.name='InvalidStateError'; throw e;} this.live=true; setTimeout(()=>{this.onstart&&this.onstart();},10);}
  stop(){ this.live=false; setTimeout(()=>this.onend&&this.onend(),5);} abort(){ this.live=false; setTimeout(()=>{this.onerror&&this.onerror({error:'aborted'}); this.onend&&this.onend();},5);} }
window.SpeechRecognition=FakeRec; window.webkitSpeechRecognition=FakeRec;
window.__say=(text,isFinal)=>{ const r=window.__recs.filter(x=>x.live).at(-1); if(!r) return 'none'; r.onresult&&r.onresult({resultIndex:0,results:[{isFinal,0:{transcript:text},length:1}]}); return r.lang; };
