// TLS Trail frontend. Talks to the backend through /lab/api/* (contract: docs/API.md)
{
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const viaTLS=location.protocol==='https:';
const hdrs=h=>Object.entries(h||{}).map(([k,v])=>`${k}: ${v}`).join('\n');
const NEED={whoami:['port','protocol','httpVersion','remoteAddress','headers'],trace:['port','protocol','httpVersion','remoteAddress','headers','mode','msg','status','result','requestLine']};
function missing(obj,kind){return NEED[kind].filter(k=>obj==null||obj[k]===undefined)}
async function getJSON(url){
  const r=await fetch(url,{cache:'no-store'});
  const t=await r.text();
  try{return JSON.parse(t)}catch(e){throw new Error(`HTTP ${r.status}: ${t.slice(0,120)}`)}
}

$('#ctx').textContent=viaTLS
  ?`Page loaded over HTTPS from ${location.host}: your requests go through Nginx.`
  :`Page loaded over plain HTTP straight from ${location.host}: no TLS, no Nginx. Compare with https://monsite.local/lab/`;
if(!viaTLS)$('#ctx').classList.add('clr');

let sim=null,step=0;
const STEPS=['Client','Nginx','Routing','Backend','Return'];
const HL=[['n-client','l-1'],['n-nginx'],['l-2','B'],['B'],['l-2','n-nginx','l-1','n-client']];

$('#simForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const msg=$('#msg').value,mode=$('#mode').value;
  $('#stText').innerHTML='<div class="empty">Request in progress…</div>';
  try{
    const r=await getJSON(`api/trace?mode=${mode}&msg=${encodeURIComponent(msg)}`);
    const m=missing(r,'trace');
    if(m.length)throw new Error(`/lab/api/trace answered, but these fields are missing from its JSON: ${m.join(', ')} (see docs/API.md)`);
    r.headers=r.headers||{};sim=r;step=0;render();
  }catch(err){
    sim=null;render();
    $('#stText').innerHTML=`<div class="who clr">No usable answer: ${esc(err.message)}. Check that the backends are running (502 = Nginx can't reach any backend).</div>`;
  }
});
$('#prev').addEventListener('click',()=>{if(step>0){step--;render()}});
$('#next').addEventListener('click',()=>{if(step<4){step++;render()}});

function render(){
  document.querySelectorAll('.map .on').forEach(n=>n.classList.remove('on'));
  $('#prev').disabled=!sim||step===0;$('#next').disabled=!sim||step===4;
  if(!sim){$('#dots').innerHTML='';$('#pk').textContent='—';return}
  const bid=sim.port===3000?'n-b1':'n-b2';
  HL[step].forEach(id=>{const el=document.getElementById(id==='B'?bid:id);if(el)el.classList.add('on')});
  $('#dots').innerHTML=STEPS.map((s,i)=>`<button type="button" class="dot${i===step?' cur':''}" data-i="${i}">${i+1}. ${s}</button>`).join('');
  $('#dots').querySelectorAll('.dot').forEach(d=>d.addEventListener('click',()=>{step=+d.dataset.i;render()}));
  const xff=sim.headers['x-forwarded-for'];
  const S=[
   {t:viaTLS?'The browser sends the request inside TLS':'The browser sends the request in plain text',
    p:viaTLS?`Your page comes from ${location.host} over HTTPS. The browser checked the certificate (signed by MyLocalCA, SAN monsite.local), then sent the request shown here inside the TLS session, on port 443.`:`You are connected straight to the backend, with no Nginx in between. Nothing is encrypted: this request travels as is.`,
    w:viaTLS?'On the network, an observer sees encrypted bytes, the IP, port 443 and the site name (SNI). To check, capture with tcpdump -i any port 443.':'An observer on the network can read this request word for word.',c:!viaTLS,
    h:'Request sent by the browser',k:`GET ${location.pathname.replace(/[^/]*$/,'')}api/trace?mode=${sim.mode}&msg=${encodeURIComponent(sim.msg)}\nHost: ${location.host}`},
   {t:xff?'Nginx terminated TLS':'No proxy on the path',
    p:xff?'Nginx decrypted the request, then added X-Real-IP and X-Forwarded-For before passing it on. These are the headers the backend really received.':'The backend received neither X-Forwarded-For nor X-Real-IP: there is no Nginx between you and it.',
    w:`The backend sees protocol = "${sim.protocol}" and HTTP/${sim.httpVersion}, while your page uses ${location.protocol.replace(':','')}. ${sim.protocol==='http'&&viaTLS?'That is the proof of SSL offloading.':''}`,c:sim.protocol==='http',
    h:'Headers received by the backend',k:hdrs(sim.headers)},
   {t:`Nginx picked backend :${sim.port}`,
    p:`The connection to the backend comes from ${sim.remoteAddress}. Send again a few times: the port changes if round-robin works. Also look at the terminal of backend :${sim.port}, a new log line just showed up.`,
    w:`This leg is plain HTTP on the loopback interface. To see it: sudo tcpdump -i lo -A port ${sim.port}`,c:true,
    h:`Request received on localhost:${sim.port}`,k:`${sim.requestLine}\n${hdrs(sim.headers)}`},
   {t:'Express applies AES-256-CBC',
    p:sim.mode==='encrypt'?'The backend’s encrypt() function encrypted your message with the key and IV from server.js, then encoded the result in base64.':'The decrypt() function decoded the base64 and decrypted it with the same key and IV. Invalid input returns 400.',
    w:`Status: ${sim.status}. Copy the result and send it to /decrypt for the round trip.`,c:false,
    h:`Computed on backend :${sim.port}`,k:`${sim.mode}("${sim.msg}")\n→ ${sim.result}`},
   {t:'The response travels back',
    p:viaTLS?'The backend answered Nginx over HTTP, Nginx re-encrypted the response inside the TLS session, and your page displays it.':'The backend answered you directly, in plain text.',
    w:viaTLS?'Plain text between backend and Nginx, encrypted between Nginx and you.':'Plain text along the whole path.',c:true,
    h:'Response received by the page',k:`HTTP ${sim.status}\n\n${sim.result}`}
  ][step];
  $('#stText').innerHTML=`<h3>${esc(S.t)}</h3><p>${esc(S.p)}</p><div class="who${S.c?' clr':''}">${esc(S.w)}</div>`;
  $('#pkTitle').textContent=S.h;$('#pk').textContent=S.k;
}

let cnt={},logs=[],busy=false,contract='';
async function hit(){
  try{const r=await getJSON('api/whoami');const m=missing(r,'whoami');if(m.length){contract=`/lab/api/whoami is missing: ${m.join(', ')}`;throw new Error(contract)}cnt[r.port]=(cnt[r.port]||0)+1;logs.unshift({p:r.port})}
  catch(e){cnt.err=(cnt.err||0)+1;logs.unshift({p:'error'})}
  logs=logs.slice(0,30);
}
async function run(n,par){
  if(busy)return;busy=true;
  if(par)await Promise.all(Array.from({length:n},hit));else for(let i=0;i<n;i++)await hit();
  busy=false;draw();
}
function draw(){
  const a=cnt[3000]||0,b=cnt[3001]||0,t=a+b||1;
  $('#c1').textContent=a;$('#c2').textContent=b;
  $('#f1').style.width=(a/t*100)+'%';$('#f2').style.width=(b/t*100)+'%';
  $('#log').innerHTML=logs.map(l=>`<span class="chip ${l.p===3000?'p1':'p2'}">${l.p==='error'?'error':':'+l.p}</span>`).join('');
  let v='';
  if(logs.length){
    const seq=logs.slice(0,10).map(l=>l.p);
    const strict=seq.length>1&&seq.every((p,i)=>i===0||p!==seq[i-1]);
    if(contract)v=contract+' (see docs/API.md)';
    else if(cnt.err)v=`${cnt.err} request(s) failed: one backend isn't answering, or neither is (502).`;
    else if(a&&!b||b&&!a)v='Only one backend answers: the other one is stopped, or the page isn’t being served through Nginx.';
    else v=strict?'Strict alternation over the latest requests.':'Roughly even split, but some consecutive requests land on the same backend.';
  }
  $('#verdict').textContent=v;
}
$('#send1').addEventListener('click',()=>run(1,false));
$('#send10').addEventListener('click',()=>run(10,false));
$('#sendp').addEventListener('click',()=>run(10,true));
$('#reset').addEventListener('click',()=>{cnt={};logs=[];contract='';draw()});

const Q=[
 {q:'Why must the server certificate contain subjectAltName = DNS:monsite.local?',o:['Chromium ignores the CN and checks the name in the SAN','The SAN encrypts the server’s private key','Without a SAN, Nginx refuses to start'],a:0,e:'Modern browsers no longer look at the Common Name: the site name has to be in the SAN, otherwise you get “Not secure”.'},
 {q:'Where does TLS encryption stop in this lab?',o:['In the Express backend','In Nginx','In the browser'],a:1,e:'Nginx terminates TLS (SSL offloading). It decrypts the request, then forwards it to the backends over HTTP.'},
 {q:'Which protocol runs between Nginx and the backends?',o:['HTTPS with the same certificate','Plain HTTP','WireGuard'],a:1,e:'proxy_pass http://backend_servers: it is plain HTTP, on the VM’s loopback interface.'},
 {q:'What is the X-Forwarded-For header added by Nginx for?',o:['Passing the real client IP to the backend','Choosing the backend','Checking the certificate'],a:0,e:'The backend only sees Nginx as its client. X-Forwarded-For tells it where the original request came from.'},
 {q:'What does the “port 3000 / port 3001” alternation prove when you rerun curl on /?',o:['That TLS works','That Nginx spreads the load across both backends','That AES is set up correctly'],a:1,e:'That is the upstream’s round-robin: each request goes to the next backend.'},
 {q:'Why must the key and IV be identical on both backends?',o:['So Nginx can read the messages','Because Express requires it','So a message encrypted by one can be decrypted by the other'],a:2,e:'Load balancing can send /encrypt to :3000 and then /decrypt to :3001. With different keys, decryption would fail.'},
 {q:'Why add “127.0.0.1 monsite.local” to /etc/hosts?',o:['So monsite.local points to the VM without a DNS server','To allow port 443','To install the CA'],a:0,e:'monsite.local exists in no DNS. /etc/hosts resolves it locally.'},
 {q:'With ab, what does the -k option change?',o:['It turns off certificate checks','It enables keep-alive: connections are reused','It doubles the number of requests'],a:1,e:'With keep-alive, one connection serves several requests. Over HTTPS, that avoids a new TLS handshake every time.'},
 {q:'Without a zone directive in the upstream, why isn’t the alternation strict?',o:['Each Nginx worker keeps its own round-robin counter','Backend :3001 is slower','TLS shuffles the requests'],a:0,e:'Each worker counts on its own. The zone directive puts the upstream state in memory shared by all workers.'}
];
let ans={};
function quiz(){
  $('#qs').innerHTML=Q.map((x,i)=>`<div class="q"><p>${i+1}. ${esc(x.q)}</p>${x.o.map((o,j)=>{let c='';if(i in ans){if(j===x.a)c='good';else if(j===ans[i])c='bad'}return `<button type="button" class="${c}" data-q="${i}" data-o="${j}"${i in ans?' disabled':''}>${esc(o)}</button>`}).join('')}${i in ans?`<p class="exp">${ans[i]===x.a?'Right. ':'Not quite. '}${esc(x.e)}</p>`:''}</div>`).join('');
  $('#qs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ans[+b.dataset.q]=+b.dataset.o;quiz()}));
  $('#score').textContent=Object.keys(ans).filter(k=>ans[k]===Q[k].a).length+' / '+Q.length;
}
$('#qreset').addEventListener('click',()=>{ans={};quiz()});
quiz();draw();
}
