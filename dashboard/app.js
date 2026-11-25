(function(){
'use strict';
var R=window.RADAR;
var main=document.getElementById('main');
var errEl=document.getElementById('load-error');
if(!R||!R.rows||!R.rows.length){
  if(errEl)errEl.hidden=false;
  if(main)main.hidden=true;
  return;
}
var SRC='https'+'://'+'api.llama.fi/protocols';
var PAGE=50;
var ROWS=R.rows;
var COMP=R.comparables.slice().sort(function(a,b){return b.mcap_usd-a.mcap_usd;});
var bySlug={};
ROWS.forEach(function(r){bySlug[r.slug]=r;});
var minCompTvl=Math.min.apply(null,R.comparables.map(function(c){return c.tvl_usd;}));

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmt3(v){
  if(v==null)return 'UNKNOWN';
  var a=Math.abs(v),u,d,x,s;
  if(a>=1e9){u='B';d=1e9;}else if(a>=1e6){u='M';d=1e6;}else if(a>=1e3){u='K';d=1e3;}
  else return '$'+String(Math.round(v));
  x=v/d;
  s=x.toPrecision(3);
  if(s.indexOf('e')>=0){
    if(u==='K'){u='M';d=1e6;x=v/d;s=x.toPrecision(3);}
    else if(u==='M'){u='B';d=1e9;x=v/d;s=x.toPrecision(3);}
    else return '$'+String(Math.round(v/1e9))+'B';
    if(s.indexOf('e')>=0)return '$'+String(Math.round(v/d)) + u;
  }
  if(s.indexOf('.')>=0)s=s.replace(/0+$/,'').replace(/\.$/,'');
  return '$'+s+u;
}
function fmtFull(v){return '$'+String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function fmtPct(v){
  if(v==null)return 'UNKNOWN';
  var s=Math.abs(v).toFixed(1)+'%';
  return v<0?'\u2212'+s:(v>0?'+'+s:s);
}
function fmtAge(d){
  if(d==null)return 'UNKNOWN';
  if(d<365)return d+'d';
  return (d/365).toFixed(1)+'y';
}
function bandLabel(b){
  if(b==='>=100M')return '$100M+';
  if(b==='10M-100M')return '$10M\u2013$100M';
  if(b==='1M-10M')return '$1M\u2013$10M';
  return 'Under $1M';
}
function chainCell(ch){
  var t=ch.slice(0,3).map(esc).join(', ');
  if(ch.length>3)t+=' +'+(ch.length-3)+' more';
  return t;
}
function dqBadges(r){
  var out=[];
  if(r.data_quality.indexOf('listed_at_unknown')>=0)out.push('<span class="badge">Listed date unknown</span>');
  if(r.data_quality.indexOf('change_7d_unknown')>=0)out.push('<span class="badge">7d change unknown</span>');
  if(r.data_quality.indexOf('extrapolation_low')>=0)out.push('<span class="badge ex">Extrapolation: below range</span>');
  return out.join(' ');
}
function uncHint(r){
  var t='± order-of-magnitude';
  if(r.extrapolation==='EXTRAPOLATION_LOW')t='Extrapolation: below range \u2014 treat with extra caution';
  return '<span class="unc"><a href="#tab=model">'+esc(t)+'</a></span>';
}

/* ---------- state from hash ---------- */
function readHash(){
  var p=new URLSearchParams(location.hash.replace(/^#/,''));
  return {
    tab:p.get('tab')||'board',
    q:p.get('q')||'',
    category:p.get('category')||'All',
    watchlist:p.get('watchlist')==='1',
    extrap:p.get('extrap')||'all',
    sort:p.get('sort')||'implied',
    dir:p.get('dir')||'desc',
    page:Math.max(1,parseInt(p.get('page')||'1',10)||1),
    selected:p.get('selected')||''
  };
}
var S=readHash();
function writeHash(){
  var p=new URLSearchParams();
  p.set('tab',S.tab);
  if(S.q)p.set('q',S.q);
  if(S.category&&S.category!=='All')p.set('category',S.category);
  if(S.watchlist)p.set('watchlist','1');
  if(S.extrap&&S.extrap!=='all')p.set('extrap',S.extrap);
  if(S.sort!=='implied'||S.dir!=='desc'){p.set('sort',S.sort);p.set('dir',S.dir);}
  if(S.page>1)p.set('page',String(S.page));
  if(S.selected)p.set('selected',S.selected);
  var h='#'+p.toString();
  if(location.hash!==h)history.replaceState(null,'',h);
}
function $(id){return document.getElementById(id);}

/* ---------- header ---------- */
(function(){
  var c=R.counts;
  $('hdr-model').textContent=R.model_version;
  $('hdr-sub').textContent='Implied values are conditional estimates from a single '+R.as_of+' snapshot \u2014 order-of-magnitude, not precise valuations.';
  $('hdr-stats').innerHTML=
    '<div><dt>Protocols scanned</dt><dd>'+c.protocols_scanned+'</dd></div>'+
    '<div><dt>Pre-token</dt><dd>'+c.pre_token+'</dd></div>'+
    '<div><dt>Watchlist</dt><dd>'+c.watchlist+'</dd></div>'+
    '<div><dt>Comparables</dt><dd>'+c.comparable+'</dd></div>';
  $('hdr-src').textContent='Snapshot '+R.as_of+' \u00b7 Source: DefiLlama '+SRC+' (static, not live prices)';
})();

/* ---------- tabs ---------- */
var TABS=['board','model','farm','about'];
var updateComp=null;
function showTab(tab){
  if(TABS.indexOf(tab)<0)tab='board';
  S.tab=tab;
  TABS.forEach(function(t){
    var sec=$('tab-'+t);
    if(sec)sec.hidden=(t!==tab);
    var btn=document.querySelector('[data-tab="'+t+'"]');
    if(btn)btn.setAttribute('aria-pressed',String(t===tab));
  });
  if(tab==='farm')prefillFarm();
  if(tab==='board')updateBoard(true);
  if(tab==='model'&&updateComp)updateComp();
}
document.querySelectorAll('[data-tab]').forEach(function(b){
  b.addEventListener('click',function(){S.tab=b.getAttribute('data-tab');S.page=1;writeHash();showTab(S.tab);});
});

/* ---------- board ---------- */
var CATS=[];
(function(){var m={};ROWS.forEach(function(r){m[r.category]=1;});CATS=Object.keys(m).sort();})();
function filteredRows(){
  var q=S.q.trim().toLowerCase();
  return ROWS.filter(function(r){
    if(S.watchlist&&!r.watchlist)return false;
    if(S.extrap==='in'&&r.extrapolation!=='IN_RANGE')return false;
    if(S.extrap==='low'&&r.extrapolation!=='EXTRAPOLATION_LOW')return false;
    if(S.extrap==='high'&&r.extrapolation!=='EXTRAPOLATION_HIGH')return false;
    if(S.category!=='All'&&r.category!==S.category)return false;
    if(q){
      var hay=(r.name+' '+r.slug+' '+r.category+' '+r.chains.join(' ')).toLowerCase();
      if(hay.indexOf(q)<0)return false;
    }
    return true;
  });
}
function cmpVal(a,b){if(a==null&&b==null)return 0;if(a==null)return 1;if(b==null)return -1;return a-b;}
function sortedRows(rows){
  var arr=rows.slice();
  arr.sort(function(a,b){
    var c=0;
    if(S.sort==='rank')c=a.rank-b.rank;
    else if(S.sort==='implied')c=a.implied_value_usd-b.implied_value_usd;
    else if(S.sort==='tvl')c=cmpVal(a.tvl_usd,b.tvl_usd);
    else if(S.sort==='change')c=cmpVal(a.change_7d,b.change_7d);
    else if(S.sort==='age')c=cmpVal(a.age_days,b.age_days);
    else if(S.sort==='chains')c=a.chains.length-b.chains.length;
    if(c!==0&&S.dir==='desc')c=-c;
    if(c===0)c=a.rank-b.rank;
    return c;
  });
  return arr;
}
function sortMark(key){
  if(S.sort!==key)return '';
  return S.dir==='asc'?' \u25b2':' \u25bc';
}
function buildBoard(){
  var sec=$('tab-board');
  var opts='<option value="All">All categories</option>'+CATS.map(function(c){
    return '<option value="'+esc(c)+'"'+(S.category===c?' selected':'')+'>'+esc(c)+'</option>';
  }).join('');
  sec.innerHTML=
    '<div class="toolbar">'+
    '<input type="search" id="q" aria-label="Search protocols" placeholder="Search name, slug, category or chain" value="'+esc(S.q)+'">'+
    '<select id="cat" aria-label="Category filter">'+opts+'</select>'+
    '<label><input type="checkbox" id="wl"'+(S.watchlist?' checked':'')+'> Watchlist only</label>'+
    '<select id="ex" aria-label="Extrapolation filter">'+
    '<option value="all"'+(S.extrap==='all'?' selected':'')+'>All rows</option>'+
    '<option value="in"'+(S.extrap==='in'?' selected':'')+'>In range</option>'+
    '<option value="low"'+(S.extrap==='low'?' selected':'')+'>Extrapolation: below range</option>'+
    '<option value="high"'+(S.extrap==='high'?' selected':'')+'>Extrapolation: above range</option>'+
    '</select></div>'+
    '<p class="count" id="count"></p>'+
    '<div id="notfound" class="warnbox" hidden></div>'+
    '<table><thead><tr>'+
    '<th class="num"><button type="button" data-sort="rank">Rank'+sortMark('rank')+'</button></th>'+
    '<th>Protocol</th>'+
    '<th>Category</th>'+
    '<th class="num"><button type="button" data-sort="implied">Implied value'+sortMark('implied')+'</button></th>'+
    '<th>Band</th>'+
    '<th class="num"><button type="button" data-sort="tvl">TVL'+sortMark('tvl')+'</button></th>'+
    '<th class="num"><button type="button" data-sort="change">7d'+sortMark('change')+'</button></th>'+
    '<th class="num"><button type="button" data-sort="chains">Chains'+sortMark('chains')+'</button></th>'+
    '<th><button type="button" data-sort="age">Age'+sortMark('age')+'</button></th>'+
    '<th>Flags</th></tr></thead>'+
    '<tbody id="tbody"></tbody></table>'+
    '<div class="pager" id="pager"></div>'+
    '<p class="small">Rank is always the implied-value order. Sorting by TVL, 7d change, age or chains only changes the view; it never changes rank. Watchlist membership is a DefiLlama floor, not a recommendation.</p>';
  $('q').addEventListener('input',function(){S.q=this.value;S.page=1;writeHash();updateBoard(false);});
  $('cat').addEventListener('change',function(){S.category=this.value;S.page=1;writeHash();updateBoard(false);});
  $('wl').addEventListener('change',function(){S.watchlist=this.checked;S.page=1;writeHash();updateBoard(false);});
  $('ex').addEventListener('change',function(){S.extrap=this.value;S.page=1;writeHash();updateBoard(false);});
  sec.querySelectorAll('th button').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.getAttribute('data-sort');
      if(S.sort===k){S.dir=(S.dir==='asc'?'desc':'asc');}
      else{S.sort=k;S.dir=(k==='rank'?'asc':'desc');}
      S.page=1;writeHash();buildBoardHead();updateBoard(false);
    });
  });
  sec.querySelector('tbody').addEventListener('click',function(e){
    if(e.target.closest('a'))return;
    var tr=e.target.closest('tr[data-slug]');
    if(!tr)return;
    S.selected=tr.getAttribute('data-slug');writeHash();openDrawer(S.selected);
  });
}
function buildBoardHead(){
  document.querySelectorAll('#tab-board th button').forEach(function(b){
    var k=b.getAttribute('data-sort');
    b.textContent=b.textContent.replace(/ [\u25b2\u25bc]$/,'')+sortMark(k);
  });
}
function rowHtml(r){
  var flags='';
  if(r.watchlist)flags+='<span class="badge wl">Watchlist</span>';
  if(r.extrapolation==='EXTRAPOLATION_LOW')flags+='<span class="badge ex">Extrapolation: below range</span>';
  if(r.extrapolation==='EXTRAPOLATION_HIGH')flags+='<span class="badge ex">Extrapolation: above range</span>';
  return '<tr data-slug="'+esc(r.slug)+'">'+
    '<td class="num">'+r.rank+'</td>'+
    '<td><div>'+esc(r.name)+'</div><div class="slug">'+esc(r.slug)+'</div></td>'+
    '<td>'+esc(r.category)+'</td>'+
    '<td class="num"><div>'+fmt3(r.implied_value_usd)+'</div>'+uncHint(r)+'</td>'+
    '<td>'+esc(bandLabel(r.implied_band))+'</td>'+
    '<td class="num">'+fmt3(r.tvl_usd)+'</td>'+
    '<td class="num">'+fmtPct(r.change_7d)+'</td>'+
    '<td class="num">'+r.chains.length+'<div class="slug">'+chainCell(r.chains)+'</div></td>'+
    '<td>'+fmtAge(r.age_days)+'</td>'+
    '<td>'+flags+'</td></tr>';
}
function updateBoard(sync){
  var tb=$('tbody');if(!tb)return;
  if(sync){
    var q=$('q');if(q&&document.activeElement!==q)q.value=S.q;
    var c=$('cat');if(c)c.value=S.category;
    var w=$('wl');if(w)w.checked=S.watchlist;
    var e=$('ex');if(e)e.value=S.extrap;
  }
  var rows=sortedRows(filteredRows());
  var pages=Math.max(1,Math.ceil(rows.length/PAGE));
  if(S.page>pages)S.page=pages;
  var start=(S.page-1)*PAGE;
  var slice=rows.slice(start,start+PAGE);
  tb.innerHTML=slice.length?slice.map(rowHtml).join(''):'<tr><td colspan="10" class="empty">No protocols match these filters.</td></tr>';
  var cnt=$('count');
  if(rows.length===ROWS.length){cnt.textContent='Showing '+(rows.length?start+1:0)+'\u2013'+(start+slice.length)+' of '+rows.length+' protocols';}
  else{cnt.textContent='Showing '+(rows.length?start+1:0)+'\u2013'+(start+slice.length)+' of '+rows.length+' protocols \u00b7 '+ROWS.length+' total';}
  var pg=$('pager');
  var nums='';
  for(var i=1;i<=pages;i++){nums+='<button type="button" data-page="'+i+'"'+(i===S.page?' aria-pressed="true"':'')+'>'+i+'</button>';}
  pg.innerHTML='<button type="button" id="prev"'+(S.page<=1?' disabled':'')+'>Previous</button>'+nums+
    '<button type="button" id="next"'+(S.page>=pages?' disabled':'')+'>Next</button>'+
    '<span class="small">Page '+S.page+' of '+pages+'</span>';
  pg.querySelectorAll('[data-page]').forEach(function(b){
    b.addEventListener('click',function(){S.page=parseInt(b.getAttribute('data-page'),10);writeHash();updateBoard(false);});
  });
  var pv=$('prev'),nx=$('next');
  if(pv)pv.addEventListener('click',function(){if(S.page>1){S.page--;writeHash();updateBoard(false);}});
  if(nx)nx.addEventListener('click',function(){if(S.page<pages){S.page++;writeHash();updateBoard(false);}});
  var nf=$('notfound');
  if(S.selected&&!bySlug[S.selected]){
    nf.hidden=false;nf.textContent='Protocol not found in this board.';
  }else if(nf){nf.hidden=true;}
}

/* ---------- detail drawer ---------- */
function uncBlock(){
  var u=R.uncertainty;
  var med=Math.exp(u.med_abs_log_err).toFixed(1);
  return '<p>Median error about '+med+'\u00d7 (LOO, n=128, all out-of-sample; med_abs_log_err '+u.med_abs_log_err.toFixed(2)+'; within 2\u00d7 '+u.within_2x_pct.toFixed(1)+'%; within 3\u00d7 '+u.within_3x_pct.toFixed(1)+'%).</p>'+
  '<p>\u03b2 95% CI ['+u.beta_ci_low+', '+u.beta_ci_high+']. At TVL $500M, the joint 95% interval for implied value is about $21.6M\u2013$61.0M (about '+u.joint_95_ratio_at_tvl_500M+'\u00d7).</p>'+
  '<p>'+esc(u.note)+'</p>';
}
function openDrawer(slug){
  var r=bySlug[slug];
  var dr=$('drawer');
  if(!r){dr.hidden=true;return;}
  var ex='';
  if(r.extrapolation==='EXTRAPOLATION_LOW'){
    var pct=((minCompTvl-r.tvl_usd)/minCompTvl*100).toFixed(2);
    ex='<div class="warnbox"><strong>Extrapolation: below range.</strong> This protocol\u2019s TVL ('+fmtFull(r.tvl_usd)+') is below the lowest comparable TVL ('+fmtFull(minCompTvl)+') by '+pct+'%. The model was not trained on protocols this small \u2014 treat the estimate with extra caution.</div>';
  }
  dr.innerHTML=
    '<button type="button" class="x" id="dx">Close \u00d7</button>'+
    '<h2>'+esc(r.name)+'</h2>'+
    '<p class="small">'+esc(r.slug)+' \u00b7 '+esc(r.category)+'</p>'+
    '<p>'+(r.watchlist?'<span class="badge wl">Watchlist</span>':'')+
    (r.extrapolation==='EXTRAPOLATION_LOW'?'<span class="badge ex">Extrapolation: below range</span>':'')+
    (r.extrapolation==='EXTRAPOLATION_HIGH'?'<span class="badge ex">Extrapolation: above range</span>':'')+'</p>'+
    '<dl class="kv">'+
    '<dt>TVL</dt><dd>'+fmt3(r.tvl_usd)+' <span class="small">('+fmtFull(r.tvl_usd)+')</span></dd>'+
    '<dt>7d change</dt><dd>'+fmtPct(r.change_7d)+' <span class="small">Single-week window; the snapshot week was broadly down.</span></dd>'+
    '<dt>Chains</dt><dd>'+r.chains.length+' \u2014 '+r.chains.map(esc).join(', ')+'</dd>'+
    '<dt>Age</dt><dd>'+fmtAge(r.age_days)+(r.listed_at?' <span class="small">listed '+esc(r.listed_at)+'</span>':'')+'</dd>'+
    '<dt>Watchlist</dt><dd>'+(r.watchlist?'Yes':'No')+' <span class="small">Watchlist membership is a DefiLlama floor, not a recommendation.</span></dd>'+
    '<dt>Implied value</dt><dd>'+fmt3(r.implied_value_usd)+' <span class="small">('+fmtFull(r.implied_value_usd)+')</span><br><span class="small">'+esc(r.uncertainty==='order-of-magnitude'?'± order-of-magnitude':'')+'</span></dd>'+
    '<dt>Implied band</dt><dd>'+esc(bandLabel(r.implied_band))+' <span class="small">Priority band, not profitability.</span></dd>'+
    '<dt>Token status</dt><dd>pre-token <span class="small">The snapshot records no token (no CoinGecko id, no symbol, no market cap).</span></dd>'+
    '<dt>Data quality</dt><dd>'+(dqBadges(r)||'No flags')+'</dd>'+
    '</dl>'+
    '<h3>Model</h3>'+
    '<p class="mono">implied = exp(6.9646 + 0.5223 \u00d7 ln(TVL))</p>'+
    '<p class="small">Full precision \u03b1 = '+R.model.alpha+', \u03b2 = '+R.model.beta+'. Single input: TVL in raw USD. The same function scores every row. No protocol name is ever special-cased.</p>'+
    '<h3>Uncertainty</h3>'+uncBlock()+ex+
    '<h3>Farm plan</h3><ol class="steps">'+r.farm_steps.map(function(s){return '<li>'+esc(s)+'</li>';}).join('')+'</ol>'+
    '<p><button type="button" id="to-farm">Open Farm Calculator with this implied value</button></p>'+
    '<p class="small">Source: DefiLlama '+SRC+' \u2014 Snapshot '+R.as_of+' (static, not live prices).<br>Snapshot sha256: <span class="mono" title="'+esc(R.snapshot_sha256)+'">'+esc(R.snapshot_sha256.slice(0,16))+'\u2026</span></p>';
  dr.hidden=false;
  $('dx').addEventListener('click',closeDrawer);
  $('to-farm').addEventListener('click',function(){
    S.tab='farm';writeHash();showTab('farm');prefillFarm(slug);
  });
}
function closeDrawer(){
  $('drawer').hidden=true;
  if(S.selected){S.selected='';writeHash();}
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&!$('drawer').hidden)closeDrawer();
});

/* ---------- farm calculator ---------- */
function buildFarm(){
  var sec=$('tab-farm');
  var opts='<option value="">Custom value</option>'+ROWS.map(function(r){
    return '<option value="'+esc(r.slug)+'">'+r.rank+' \u00b7 '+esc(r.name)+' \u2014 '+fmt3(r.implied_value_usd)+'</option>';
  }).join('');
  sec.innerHTML=
    '<h2>Farm Calculator</h2>'+
    '<p>Use your own cost, share and probability to judge one protocol\u2019s implied value. EV = V \u00d7 s \u00d7 p. FARM iff EV \u2265 3C; THIN iff C \u2264 EV &lt; 3C; SKIP iff EV &lt; C. The calculation runs in your browser only; nothing is stored.</p>'+
    '<div class="form">'+
    '<label for="f-proto">Protocol</label><select id="f-proto">'+opts+'</select>'+
    '<label for="f-v">Implied value (V) \u2014 USD</label><input id="f-v" type="text" inputmode="decimal" placeholder="Pick a protocol or enter a value">'+
    '<label for="f-c">All-in cost (C) \u2014 USD</label><input id="f-c" type="text" inputmode="decimal" placeholder="Your own cost; empty means UNKNOWN">'+
    '<p class="hint">C is your own input. It is not in the snapshot.</p>'+
    '<label for="f-s">Allocation share (s)</label><input id="f-s" type="text" inputmode="decimal" placeholder="0\u20131 or 0\u2013100%">'+
    '<label for="f-p">Probability of allocation (p)</label><input id="f-p" type="text" inputmode="decimal" placeholder="0\u20131 or 0\u2013100%">'+
    '</div>'+
    '<p><button type="button" id="f-go">Calculate</button></p>'+
    '<p class="errline" id="f-err" hidden></p>'+
    '<div id="f-out"></div>'+
    '<p class="small">C, s and p are your own inputs. None of them is in the snapshot. Refreshing the page clears them.</p>';
  $('f-proto').addEventListener('change',function(){
    var r=bySlug[this.value];
    if(r){$('f-v').value=String(r.implied_value_usd);}
    farmErr('');computeFarm();
  });
  $('f-v').addEventListener('input',function(){
    var sel=$('f-proto');
    if(sel.value){sel.value='';}
    farmErr('');computeFarm();
  });
  ['f-c','f-s','f-p'].forEach(function(id){
    $(id).addEventListener('input',function(){farmErr('');computeFarm();});
  });
  $('f-go').addEventListener('click',function(){computeFarm();});
}
function farmErr(msg){
  var e=$('f-err');
  if(!e)return;
  if(msg){e.hidden=false;e.textContent=msg;}else{e.hidden=true;e.textContent='';}
}
function parseNum(str){
  var s=String(str).trim();
  if(!s)return null;
  var n=Number(s);
  return isFinite(n)?n:null;
}
function parseShare(str){
  var s=String(str).trim();
  if(!s)return null;
  var pct=false;
  if(s.charAt(s.length-1)==='%'){pct=true;s=s.slice(0,-1).trim();}
  var n=Number(s);
  if(!isFinite(n))return null;
  if(pct)n=n/100;
  return n;
}
function computeFarm(){
  var out=$('f-out');if(!out)return;
  var v=parseNum($('f-v').value);
  var cRaw=$('f-c').value,sRaw=$('f-s').value,pRaw=$('f-p').value;
  out.innerHTML='';
  if(v==null){farmErr('');out.innerHTML='<p class="small">Pick a protocol or enter an implied value (V).</p>';return;}
  if(v<=0){farmErr('Enter an implied value above $0.');return;}
  if(!String(cRaw).trim()||!String(sRaw).trim()||!String(pRaw).trim()){
    out.innerHTML='<p class="small">Enter C, s and p to see the verdict.</p>';return;
  }
  var c=parseNum(cRaw),s=parseShare(sRaw),p=parseShare(pRaw);
  if(c==null||s==null||p==null){farmErr('Enter a number.');return;}
  if(c<=0){farmErr('Enter a cost above $0.');return;}
  if(s<0||s>1){farmErr('Share must be between 0% and 100%.');return;}
  if(p<0||p>1){farmErr('Probability must be between 0% and 100%.');return;}
  var ev=v*s*p,cls,verdict;
  if(ev>=3*c){cls='farm';verdict='FARM';}
  else if(ev>=c){cls='thin';verdict='THIN';}
  else{cls='skip';verdict='SKIP';}
  out.innerHTML=
    '<dl class="kv">'+
    '<dt>Expected value (EV)</dt><dd>'+fmt3(ev)+' <span class="small">('+fmtFull(ev)+')</span></dd>'+
    '<dt>FARM threshold (3C)</dt><dd>'+fmt3(3*c)+'</dd>'+
    '<dt>Cost (C)</dt><dd>'+fmt3(c)+'</dd>'+
    '<dt>V / 3</dt><dd>'+fmt3(v/3)+' <span class="small">V/3 is the theoretical upper bound when s = 1 and p = 1. It is not what farming is worth spending.</span></dd>'+
    '</dl>'+
    '<div class="verdict '+cls+'">'+verdict+'</div>'+
    '<p class="small">EV = V \u00d7 s \u00d7 p = '+fmtFull(v)+' \u00d7 '+s+' \u00d7 '+p+'.</p>';
}
function prefillFarm(slug){
  var r=bySlug[slug||S.selected];
  if(!r)return;
  var sel=$('f-proto');
  if(sel){sel.value=r.slug;}
  var v=$('f-v');
  if(v){v.value=String(r.implied_value_usd);}
  computeFarm();
}

/* ---------- model tab ---------- */
function buildModel(){
  var sec=$('tab-model');
  var u=R.uncertainty;
  var aboveP90=ROWS.filter(function(r){return r.tvl_usd>1100241173;}).length;
  var aboveP75=ROWS.filter(function(r){return r.tvl_usd>98181733;}).length;
  sec.innerHTML=
    '<h2>Model C</h2>'+
    '<p class="mono">implied_usd = exp(6.9646 + 0.5223 \u00d7 ln(tvl_usd))</p>'+
    '<p>Full precision \u03b1 = '+R.model.alpha+', \u03b2 = '+R.model.beta+'. Single input: TVL in raw USD. The same function scores every row. No protocol name is ever special-cased.</p>'+
    '<div class="note">Implied value is a conditional estimate: what a token would be worth <strong>if</strong> the protocol issued one <strong>and</strong> it were priced like the comparable protocols. It is not a prediction of a future price or future market cap.</div>'+
    '<h3>Validation (leave-one-out, n=128, all out-of-sample)</h3>'+
    '<dl class="kv">'+
    '<dt>Median log error</dt><dd>'+u.med_abs_log_err.toFixed(2)+' (about '+Math.exp(u.med_abs_log_err).toFixed(1)+'\u00d7 median error)</dd>'+
    '<dt>Mean log error</dt><dd>'+u.mean_abs_log_err.toFixed(2)+'</dd>'+
    '<dt>Median APE</dt><dd>'+u.med_ape+'</dd>'+
    '<dt>Within 2\u00d7</dt><dd>'+u.within_2x_pct.toFixed(1)+'%</dd>'+
    '<dt>Within 3\u00d7</dt><dd>'+u.within_3x_pct.toFixed(1)+'%</dd>'+
    '<dt>Median log bias</dt><dd>'+u.med_log_bias+'</dd>'+
    '<dt>\u03b2 95% CI</dt><dd>['+u.beta_ci_low+', '+u.beta_ci_high+']</dd>'+
    '<dt>Joint 95% at TVL $500M</dt><dd>$21.6M\u2013$61.0M (about '+u.joint_95_ratio_at_tvl_500M+'\u00d7)</dd>'+
    '</dl>'+
    '<p class="small">Cohort stability check (old cohort n=48 trained \u2192 new cohort n=47 tested): C med_abs_log_err 1.11; within-2x 34.0%. Cohort stability check, with look-ahead bias. Not a walk-forward. C vs D not significant (paired 95% CI [\u22120.129, +0.233]); C vs A significant (paired 95% CI [\u22120.600, \u22120.095]).</p>'+
    '<p>'+esc(u.note)+'</p>'+
    '<h3>Density</h3>'+
    '<p>'+aboveP90+' pre-token protocols have TVL above the comparables\u2019 p90 ($1,100,241,173); '+aboveP75+' above p75 ($98,181,733). Support is thin at the top of the range.</p>'+
    '<p class="small">7-day growth and age were tested as model inputs and dropped \u2014 no stable out-of-sample gain (see Research). They are shown as descriptive facts only.</p>'+
    '<h3>Comparables (128 protocols with a traded token)</h3>'+
    '<p class="small">These 128 protocols have a traded token. They trained the model. Their market caps are the market\u2019s own values \u2014 the board never ranks them.</p>'+
    '<div class="toolbar"><input type="search" id="cq" aria-label="Search comparables" placeholder="Search name, slug or category"></div>'+
    '<table><thead><tr><th>Protocol</th><th>Category</th>'+
    '<th class="num"><button type="button" data-csort="tvl">TVL</button></th>'+
    '<th class="num"><button type="button" data-csort="mcap">MCAP</button></th>'+
    '<th class="num">7d</th><th>Age</th></tr></thead>'+
    '<tbody id="ctbody"></tbody></table>'+
    '<div class="pager" id="cpager"></div>';
  var cq=$('cq'),csort='mcap',cdir='desc',cpage=1;
  function cfiltered(){
    var q=cq.value.trim().toLowerCase();
    var arr=COMP.filter(function(c){
      if(!q)return true;
      return (c.name+' '+c.slug+' '+c.category).toLowerCase().indexOf(q)>=0;
    });
    arr.sort(function(a,b){
      var c2=csort==='mcap'?b.mcap_usd-a.mcap_usd:a.tvl_usd-b.tvl_usd;
      if(cdir==='asc')c2=-c2;
      return c2;
    });
    return arr;
  }
  function cupd(){
    var arr=cfiltered();
    var pages=Math.max(1,Math.ceil(arr.length/PAGE));
    if(cpage>pages)cpage=pages;
    var st=(cpage-1)*PAGE,sl=arr.slice(st,st+PAGE);
    $('ctbody').innerHTML=sl.map(function(c){
      return '<tr><td><div>'+esc(c.name)+'</div><div class="slug">'+esc(c.slug)+'</div></td>'+
      '<td>'+esc(c.category)+'</td><td class="num">'+fmt3(c.tvl_usd)+'</td>'+
      '<td class="num">'+fmt3(c.mcap_usd)+'</td><td class="num">'+fmtPct(c.change_7d)+'</td>'+
      '<td>'+fmtAge(c.age_days)+'</td></tr>';
    }).join('');
    var pg=$('cpager'),nums='';
    for(var i=1;i<=pages;i++){nums+='<button type="button" data-cpage="'+i+'"'+(i===cpage?' aria-pressed="true"':'')+'>'+i+'</button>';}
    pg.innerHTML='<button type="button" id="cprev"'+(cpage<=1?' disabled':'')+'>Previous</button>'+nums+
      '<button type="button" id="cnext"'+(cpage>=pages?' disabled':'')+'>Next</button>'+
      '<span class="small">Page '+cpage+' of '+pages+' \u00b7 '+arr.length+' comparables</span>';
    pg.querySelectorAll('[data-cpage]').forEach(function(b){
      b.addEventListener('click',function(){cpage=parseInt(b.getAttribute('data-cpage'),10);cupd();});
    });
    $('cprev').addEventListener('click',function(){if(cpage>1){cpage--;cupd();}});
    $('cnext').addEventListener('click',function(){if(cpage<pages){cpage++;cupd();}});
  }
  cq.addEventListener('input',function(){cpage=1;cupd();});
  sec.querySelectorAll('[data-csort]').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.getAttribute('data-csort');
      if(csort===k){cdir=(cdir==='asc'?'desc':'asc');}
      else{csort=k;cdir='desc';}
      cupd();
    });
  });
  updateComp=cupd;
  cupd();
}

/* ---------- about tab ---------- */
function buildAbout(){
  var sec=$('tab-about');
  var nCex=ROWS.filter(function(r){return r.category==='CEX';}).length;
  sec.innerHTML=
    '<h2>About the data</h2>'+
    '<h3>1. \u201cNo token recorded\u201d \u2260 \u201cno token will ever exist.\u201d</h3>'+
    '<p>Pre-token means the snapshot records no token (no CoinGecko id, no symbol, no market cap). It does not mean the protocol has no token, has not issued one, or will issue one. Whether or when any protocol issues a token is UNKNOWN.</p>'+
    '<h3>2. Implied value is a conditional estimate, not a future price prediction.</h3>'+
    '<p>It answers: if this protocol issued a token, and it were priced like the 128 comparable protocols, what would it be worth? It is not a prediction of a future price, future FDV, or future market cap.</p>'+
    '<h3>3. The model is wrong by a lot, honestly.</h3>'+
    '<p>Leave-one-out validation (n=128, all out-of-sample): the median error is about 3.4\u00d7; only 32.0% of estimates land within 2\u00d7 of the true market cap, 42.2% within 3\u00d7. Treat every implied value as an order-of-magnitude estimate.</p>'+
    '<h3>4. Watchlist is not a recommendation.</h3>'+
    '<p>The 40 watchlist protocols are a DefiLlama floor \u2014 protocols above $50M TVL with no token recorded, excluding versioned names and wrapped, staked and bridged products (no parent protocol; category not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX; name carries no whole word wrapped, staked or staking and does not begin with an exchange\u2019s name). Membership is not an endorsement, and the board ranks 302 further protocols outside the watchlist.</p>'+
    '<h3>5. The snapshot is a static historical record, not live prices.</h3>'+
    '<p>All data is from a single DefiLlama snapshot taken 2026-11-14. Nothing here updates. TVL, prices and token status may have changed since. Source: '+SRC+' \u2014 Snapshot 2026-11-14 \u2014 sha256 <span class="mono">'+esc(R.snapshot_sha256)+'</span>.</p>'+
    '<p class="small">272 further protocols record a token but carry no usable market cap; they are in neither the board nor the training set.</p>'+
    '<h3>Special categories</h3>'+
    '<p>'+nCex+' pre-token protocols are categorised CEX (including the top 3 by implied value). They are pre-token by the same definition \u2014 no token recorded \u2014 not by an expectation that they will launch one.</p>'+
    '<p>Ranks 4 and 5 by implied value are products the snapshot\u2019s own README says are not tokens that do not exist yet: WBTC (rank 4) is Bitcoin on Ethereum, and Binance Staked ETH (rank 5) is ETH in Binance\u2019s staking product. They are pre-token by the same definition \u2014 no token recorded \u2014 not by an expectation that they will launch one. The board ranks by implied value, not by likelihood of a future launch.</p>'+
    '<p class="small">7-day change is a single-week window; the snapshot week was broadly down.</p>'+
    '<p class="small">Model version '+esc(R.model_version)+' \u00b7 Snapshot '+esc(R.as_of)+' \u00b7 Snapshot sha256 <span class="mono">'+esc(R.snapshot_sha256)+'</span></p>'+
    '<p class="small">Keep the output folder together: this page reads data.js beside dashboard/. Do not move index.html on its own.</p>';
}

/* ---------- init ---------- */
buildBoard();
buildFarm();
buildModel();
buildAbout();
showTab(S.tab);
if(S.selected&&bySlug[S.selected]){
  if(S.tab==='board')openDrawer(S.selected);
  if(S.tab==='farm')prefillFarm(S.selected);
}
window.addEventListener('hashchange',function(){
  var ns=readHash();
  var tabChanged=ns.tab!==S.tab;
  S=ns;
  if(tabChanged)showTab(S.tab);
  else{
    if(S.tab==='board')updateBoard(true);
    if(S.tab==='farm')prefillFarm(S.selected);
  }
  if(S.selected&&bySlug[S.selected]&&S.tab==='board')openDrawer(S.selected);
  else if(!S.selected)$('drawer').hidden=true;
});
})();
