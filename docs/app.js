// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════
let allData = [];
let dataLoaded = false;
let lastChecksum = null;
let filtered = [];
let showExpired = false;
let srcFilter = 'all';
let sortCol = null, sortDir = 1;
let page = 1, perPage = 100;
let trackData = {};
let selectedTrackRow = null;
let isPCMode = false;

const TODAY = new Date().toISOString().slice(0, 10);

// ══════════════════════════════════════════════
//  COLUMNS — TT20 thêm vào vị trí thứ 2
// ══════════════════════════════════════════════
const COLS = [
  { key:'STT',         label:'STT',          w:45,  show:true,  fixed:true },
  { key:'TT20',        label:'TT20',         w:55,  show:true,  cls:'tdtt' },
  { key:'QDTT',        label:'QĐTT',         w:130, show:true },
  { key:'NoiBanHanh',  label:'Nguồn',        w:70,  show:true },
  { key:'TenThuoc',    label:'Tên thuốc',    w:210, show:true,  cls:'tdn' },
  { key:'TenHoatChat', label:'Hoạt chất',    w:160, show:true },
  { key:'NongDo',      label:'Nồng độ/HL',   w:110, show:true },
  { key:'DangBaoChe',  label:'Dạng BC',      w:150, show:true },
  { key:'DuongDung',   label:'Đường dùng',   w:90,  show:false },
  { key:'QuyCach',     label:'Quy cách',     w:160, show:false },
  { key:'DonViTinh',   label:'ĐVT',          w:58,  show:true },
  { key:'DonGia',      label:'Đơn giá',      w:95,  show:true,  cls:'tdm', fmt:'money' },
  { key:'SLPhanBo',    label:'SL phân bổ',   w:100, show:true,  cls:'tdm', fmt:'num' },
  { key:'SLPhanBoBHYT',label:'SL BHYT',      w:88,  show:false, cls:'tdm', fmt:'num' },
  { key:'SLTuyChon',   label:'SL tuỳ chọn', w:95,  show:false, cls:'tdm', fmt:'num' },
  { key:'NgayBatDau',  label:'Ngày BĐ',      w:88,  show:true,  fmt:'date' },
  { key:'NgayHetHieu', label:'Hết HH',       w:88,  show:true,  fmt:'date' },
  { key:'_status',     label:'Trạng thái',   w:110, show:true,  nosort:true },
  { key:'NhaThau',     label:'Nhà thầu',     w:200, show:false },
  { key:'HangSanXuat', label:'Hãng SX',      w:180, show:false },
  { key:'NuocSanXuat', label:'Nước SX',      w:75,  show:false },
  { key:'HanDung',     label:'Hạn dùng',     w:75,  show:false },
  { key:'SDK',         label:'SĐK',           w:140, show:false },
  { key:'GoiNhom',     label:'Gói nhóm',     w:75,  show:false },
  { key:'DieuTiet',    label:'Điều tiết',    w:75,  show:false, cls:'tdm' },
  { key:'LuuY',        label:'Lưu ý',        w:180, show:false },
  { key:'_detail',     label:'Chi tiết',     w:65,  show:true,  nosort:true },
];

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('today-badge').textContent = '📅 ' + fmtDate(TODAY);
  document.getElementById('ti-month').value = TODAY.slice(0,7);
  const savedMode = localStorage.getItem('bvdn_mode') || 'mobile';
  applyMode(savedMode);
  initColToggles();
  loadGHConfig();
  await loadDataChunks();
  tryLoadLS();
  applyFilters();
  // Kiểm tra update mỗi 5 phút
  setInterval(checkForUpdates, 5*60*1000);
});

async function fetchJSON(url) {
  const res = await fetch(url + (url.includes('?')?'&':'?') + 'nc=' + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error(`${url} không phải JSON hợp lệ — GitHub Pages chưa deploy?`); }
}

async function loadDataChunks() {
  const scr = document.getElementById('loading-screen');
  const tbl = document.getElementById('tbl-wrap');
  const pag = document.getElementById('pag');

  function setP(pct, msg) {
    const el = document.getElementById('loading-text');
    if (!el) return;
    el.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:10px">${msg}</div>
      <div style="width:220px;height:8px;background:#dde4f0;border-radius:10px;margin:0 auto;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--p);border-radius:10px;transition:width .4s"></div>
      </div>
      <div style="font-size:11px;margin-top:6px;color:var(--tx3)">${pct}%</div>`;
  }

  function showErr(msg) {
    const el = document.getElementById('loading-text');
    if (!el) return;
    el.innerHTML = `<div style="color:#c62828;font-weight:700;font-size:14px;margin-bottom:8px">❌ Lỗi tải dữ liệu</div>
      <div style="color:#555;font-size:12px;white-space:pre-line;text-align:left;max-width:300px;margin:0 auto 12px">${msg}</div>
      <button class="btn btn-p" onclick="location.reload()">🔄 Thử lại</button>`;
  }

  try {
    setP(5, 'Đang kết nối...');
    let manifest;
    try { manifest = await fetchJSON('manifest.json'); }
    catch(e) {
      showErr('Không tải được manifest.json\n\n• GitHub Pages chưa bật (Settings → Pages)\n• Chưa chọn đúng branch/folder\n• Chờ 2–3 phút sau khi push\n\n' + e.message);
      return;
    }
    lastChecksum = manifest.checksum || '';
    const total = parseInt(manifest.chunks) || 0;
    if (total < 1) { showErr('manifest.json không hợp lệ'); return; }

    for (let i = 0; i < total; i++) {
      setP(Math.round(10 + (i/total)*85), `Đang tải ${i+1}/${total} phần...`);
      try {
        const chunk = await fetchJSON(`data_${i}.json`);
        if (!Array.isArray(chunk)) throw new Error('Không phải array');
        allData.push(...chunk);
      } catch(e) { showErr(`Không tải được data_${i}.json\n${e.message}`); return; }
    }

    setP(100, `✅ Đã tải ${allData.length.toLocaleString('vi')} mục thuốc`);
    document.getElementById('loaded-count').textContent = allData.length.toLocaleString('vi');
    dataLoaded = true;
    setTimeout(() => {
      if (scr) scr.style.display = 'none';
      if (tbl) tbl.style.display = '';
      if (pag) pag.style.display = '';
    }, 400);
  } catch(err) {
    console.error(err);
    showErr(err.message);
  }
}

async function checkForUpdates() {
  try {
    const res = await fetch('manifest.json?t=' + Date.now());
    if (!res.ok) return;
    const text = await res.text();
    const m = JSON.parse(text);
    if (m.checksum && m.checksum !== lastChecksum) showUpdateBanner(m);
  } catch(e) {}
}

function showUpdateBanner(m) {
  document.getElementById('update-banner')?.remove();
  const b = document.createElement('div');
  b.id = 'update-banner';
  const t = m.builtAt ? new Date(m.builtAt).toLocaleString('vi-VN') : '';
  b.innerHTML = `<div style="font-weight:700;margin-bottom:5px">🔄 Có dữ liệu mới!</div>
    <div style="font-size:11px;opacity:.85;margin-bottom:8px">Cập nhật: ${t} — ${(m.total||0).toLocaleString('vi')} mục</div>
    <div style="display:flex;gap:6px">
      <button onclick="location.reload()" style="background:#fff;color:var(--p);border:none;padding:5px 12px;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer">Tải lại</button>
      <button onclick="this.closest('#update-banner').remove()" style="background:rgba(255,255,255,.2);color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer">Để sau</button>
    </div>`;
  document.body.appendChild(b);
}

// ══════════════════════════════════════════════
//  MODE SWITCHER
// ══════════════════════════════════════════════
function toggleMode() {
  applyMode(isPCMode ? 'mobile' : 'pc');
}

function applyMode(mode) {
  isPCMode = mode === 'pc';
  document.body.classList.toggle('pc-mode', isPCMode);
  document.body.classList.toggle('mobile-mode', !isPCMode);
  const fab = document.getElementById('mode-fab');
  fab.textContent = isPCMode ? '📱 Chế độ Mobile' : '🖥️ Chế độ PC';
  localStorage.setItem('bvdn_mode', mode);
}

// ══════════════════════════════════════════════
//  STATUS
// ══════════════════════════════════════════════
function getStatus(r) {
  if (!r.NgayHetHieu) return 'unknown';
  if (r.NgayHetHieu < TODAY) return 'expired';
  if (!r.NgayBatDau || r.NgayBatDau <= TODAY) return 'active';
  return 'future';
}

function statusBadge(st, end) {
  if (st==='expired') return `<span class="badge be">⏰ Hết HH</span>`;
  if (st==='future')  return `<span class="badge bw">⏳ Chưa BĐ</span>`;
  if (st==='active') {
    const d = Math.ceil((new Date(end)-new Date(TODAY))/86400000);
    if (d<=90) return `<span class="badge bw" title="Còn ${d} ngày">⚠️ Còn ${d}n</span>`;
    return `<span class="badge ba">✅ Còn HH</span>`;
  }
  return `<span class="badge" style="background:#f5f5f5;color:#999;border-color:#ddd">❓ N/A</span>`;
}

// ══════════════════════════════════════════════
//  FILTERS
// ══════════════════════════════════════════════
function applyFilters() {
  if (!dataLoaded && !allData.length) return;
  const q1=(document.getElementById('s-qdtt').value||'').toLowerCase().trim();
  const q2=(document.getElementById('s-thuoc').value||'').toLowerCase().trim();
  const q3=(document.getElementById('s-hoat').value||'').toLowerCase().trim();

  filtered = allData.filter(r => {
    const st = getStatus(r);
    if (!showExpired && st==='expired') return false;
    if (srcFilter==='SYT'  && !(r.NoiBanHanh||'').toUpperCase().includes('SYT')) return false;
    if (srcFilter==='BVĐN' && !(r.NoiBanHanh||'').toUpperCase().includes('BV'))  return false;
    if (q1 && !(r.QDTT||'').toLowerCase().includes(q1)) return false;
    if (q2 && !(r.TenThuoc||'').toLowerCase().includes(q2)) return false;
    if (q3 && !(r.TenHoatChat||'').toLowerCase().includes(q3)) return false;
    return true;
  });

  if (sortCol) {
    filtered.sort((a,b)=>{
      const va=a[sortCol]||'', vb=b[sortCol]||'';
      const na=parseFloat(va), nb=parseFloat(vb);
      if(!isNaN(na)&&!isNaN(nb)) return (na-nb)*sortDir;
      return va.localeCompare(vb,'vi')*sortDir;
    });
  }
  page=1; updateStats(); renderTable();
}

function clearFilters() {
  document.getElementById('s-qdtt').value='';
  document.getElementById('s-thuoc').value='';
  document.getElementById('s-hoat').value='';
  srcFilter='all'; updateChips(); applyFilters();
}

function setSrc(v){srcFilter=v;updateChips();applyFilters();}
function updateChips(){
  document.getElementById('chip-all').classList.toggle('on',srcFilter==='all');
  document.getElementById('chip-syt').classList.toggle('on',srcFilter==='SYT');
  document.getElementById('chip-bvdn').classList.toggle('on',srcFilter==='BVĐN');
}

function toggleExpired(){
  showExpired=!showExpired;
  const b=document.getElementById('btn-exp');
  b.classList.toggle('on',showExpired);
  b.textContent=showExpired?'🙈 Ẩn hết HH':'👁 Hiện hết HH';
  applyFilters();
}

// ══════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════
function updateStats(){
  const t=allData.length;
  const a=allData.filter(r=>getStatus(r)==='active').length;
  const e=allData.filter(r=>getStatus(r)==='expired').length;
  const s=allData.filter(r=>(r.NoiBanHanh||'').toUpperCase().includes('SYT')).length;
  const b=allData.filter(r=>(r.NoiBanHanh||'').toUpperCase().includes('BV')).length;
  document.getElementById('s-total').textContent=t.toLocaleString('vi');
  document.getElementById('s-active').textContent=a.toLocaleString('vi');
  document.getElementById('s-exp').textContent=e.toLocaleString('vi');
  document.getElementById('s-syt').textContent=s.toLocaleString('vi');
  document.getElementById('s-bvdn').textContent=b.toLocaleString('vi');
  document.getElementById('total-badge').textContent='📋 '+t.toLocaleString('vi')+' mục';
}

// ══════════════════════════════════════════════
//  COLUMN TOGGLES
// ══════════════════════════════════════════════
function initColToggles(){
  const list=document.getElementById('col-list');
  COLS.filter(c=>!c.fixed).forEach(col=>{
    const el=document.createElement('div');
    el.className='col-item'+(col.show?'':' hid');
    el.textContent=(col.show?'✅ ':'🚫 ')+col.label;
    el.onclick=()=>{
      col.show=!col.show;
      el.className='col-item'+(col.show?'':' hid');
      el.textContent=(col.show?'✅ ':'🚫 ')+col.label;
      renderTable();
    };
    list.appendChild(el);
  });
}
function toggleColPanel(){document.getElementById('col-panel').classList.toggle('show');}

// ══════════════════════════════════════════════
//  TABLE RENDER
// ══════════════════════════════════════════════
function renderTable(){
  // Show table, hide loading
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('tbl-wrap').style.display='';
  document.getElementById('pag').style.display='';

  const vc=COLS.filter(c=>c.show);
  const head=document.getElementById('tbl-head');
  head.innerHTML=vc.map(col=>{
    const cls=sortCol===col.key?(sortDir>0?' sa':' sd'):'';
    const ca=col.nosort?'class="nosort"':`onclick="doSort('${col.key}')"`;
    return `<th style="min-width:${col.w}px" class="${cls}" ${ca}>${col.label}${col.nosort?'':'<span class="arr"></span>'}</th>`;
  }).join('');

  const s=(page-1)*perPage;
  const pageRows=filtered.slice(s,s+perPage);
  const q1=(document.getElementById('s-qdtt').value||'').toLowerCase().trim();
  const q2=(document.getElementById('s-thuoc').value||'').toLowerCase().trim();
  const q3=(document.getElementById('s-hoat').value||'').toLowerCase().trim();
  const body=document.getElementById('tbl-body');

  if(!pageRows.length){
    body.innerHTML=`<tr><td colspan="${vc.length}" class="no-data">
      <div style="font-size:28px;margin-bottom:8px">🔍</div>
      <div>Không tìm thấy kết quả phù hợp</div>
      <div style="font-size:11px;margin-top:4px;color:var(--tx3)">Thử bỏ bộ lọc hoặc bật "Hiện hết HH"</div>
    </td></tr>`;
    renderPag(); return;
  }

  body.innerHTML=pageRows.map(row=>{
    const st=getStatus(row);
    const trCls=st==='expired'?'rx':st==='future'?'rf':'';
    const cells=vc.map(col=>{
      if(col.key==='_status') return `<td class="tdc">${statusBadge(st,row.NgayHetHieu)}</td>`;
      if(col.key==='_detail') return `<td class="tdc"><button class="btn btn-ghost btn-sm" onclick="showDetail('${row.id}')">🔍</button></td>`;

      let val=row[col.key]||'';
      if(col.key==='NoiBanHanh'){
        const nb=(val||'').toUpperCase();
        val=nb.includes('SYT')?`<span class="badge bs">🏛️ SYT</span>`:
            nb.includes('BV')? `<span class="badge bb">🏥 BVĐN</span>`:
            `<span style="font-size:10px">${val}</span>`;
      } else if(col.fmt==='money') val=fmtMoney(val);
      else if(col.fmt==='num')   val=fmtNum(val);
      else if(col.fmt==='date')  val=fmtDate(val);
      else {
        const q=col.key==='QDTT'?q1:col.key==='TenThuoc'?q2:col.key==='TenHoatChat'?q3:'';
        if(q&&val) val=highlight(String(val),q);
      }
      const cls=col.cls?` class="${col.cls}"`:' ';
      const raw=row[col.key]||'';
      const ti=(typeof raw==='string'&&raw.length>20&&!String(val).includes('<'))?` title="${raw.replace(/"/g,"'")}"`:' ';
      return `<td${cls}${ti}>${val}</td>`;
    }).join('');
    return `<tr class="${trCls}">${cells}</tr>`;
  }).join('');

  renderPag();
}

function doSort(key){
  if(sortCol===key) sortDir=-sortDir; else{sortCol=key;sortDir=1;}
  applyFilters();
}

// ══════════════════════════════════════════════
//  PAGINATION
// ══════════════════════════════════════════════
function renderPag(){
  const el=document.getElementById('pag');
  const total=filtered.length, pages=Math.ceil(total/perPage)||1;
  const s=Math.min((page-1)*perPage+1,total), e=Math.min(page*perPage,total);
  let btns='';
  const lo=Math.max(1,page-3), hi=Math.min(pages,lo+6);
  if(lo>1) btns+=`<button class="pb" onclick="goPage(1)">1</button>${lo>2?'<span style="padding:0 3px;color:var(--tx3)">…</span>':''}`;
  for(let i=lo;i<=hi;i++) btns+=`<button class="pb${i===page?' on':''}" onclick="goPage(${i})">${i}</button>`;
  if(hi<pages) btns+=`${hi<pages-1?'<span style="padding:0 3px;color:var(--tx3)">…</span>':''}<button class="pb" onclick="goPage(${pages})">${pages}</button>`;
  el.innerHTML=`
    <span style="color:var(--tx2)">${s.toLocaleString('vi')}–${e.toLocaleString('vi')} / <strong>${total.toLocaleString('vi')}</strong> kết quả</span>
    <div class="pag-ctrl">
      <button class="pb" onclick="goPage(${page-1})" ${page<=1?'disabled':''}>‹</button>
      ${btns}
      <button class="pb" onclick="goPage(${page+1})" ${page>=pages?'disabled':''}>›</button>
      <select class="perp" onchange="changePerPage(this.value)">
        ${[50,100,200,500].map(n=>`<option value="${n}"${n===perPage?' selected':''}>${n}/trang</option>`).join('')}
      </select>
    </div>`;
}
function goPage(p){page=Math.max(1,Math.min(Math.ceil(filtered.length/perPage),p));renderTable();document.getElementById('tbl-wrap').scrollTop=0;}
function changePerPage(v){perPage=parseInt(v);page=1;renderTable();}

// ══════════════════════════════════════════════
//  DETAIL MODAL
// ══════════════════════════════════════════════
function showDetail(id){
  const row=allData.find(r=>r.id===id); if(!row) return;
  const st=getStatus(row);
  document.getElementById('modal-title').innerHTML=`💊 ${row.TenThuoc} &nbsp;${statusBadge(st,row.NgayHetHieu)}`;
  const fields=[
    ['TT20',row.TT20],['QĐTT',row.QDTT],
    ['Nguồn',(row.NoiBanHanh||'').includes('SYT')?'🏛️ Sở Y Tế':'🏥 BV Đà Nẵng'],
    ['Tên thuốc',row.TenThuoc],['Hoạt chất',row.TenHoatChat],
    ['Nồng độ/HL',row.NongDo],['Dạng bào chế',row.DangBaoChe],
    ['Đường dùng',row.DuongDung],['Quy cách',row.QuyCach],
    ['Hạn dùng',row.HanDung?row.HanDung+' tháng':''],['SĐK',row.SDK],
    ['Hãng SX',row.HangSanXuat],['Nước SX',row.NuocSanXuat],
    ['ĐVT',row.DonViTinh],['Đơn giá',row.DonGia?fmtMoney(row.DonGia)+' đ':''],
    ['SL phân bổ',fmtNum(row.SLPhanBo)],['SL BHYT',fmtNum(row.SLPhanBoBHYT)],
    ['SL tuỳ chọn',fmtNum(row.SLTuyChon)],['Điều tiết',row.DieuTiet],
    ['Nhà thầu',row.NhaThau],['Ngày bắt đầu HH',fmtDate(row.NgayBatDau)],
    ['Ngày hết HH',fmtDate(row.NgayHetHieu)],['Lưu ý kê đơn',row.LuuY],
    ['Gói nhóm',row.GoiNhom],
  ];
  document.getElementById('modal-body').innerHTML=`<div class="detail-grid">${
    fields.filter(([,v])=>v).map(([l,v])=>`<div class="detail-item"><label>${l}</label><p>${v}</p></div>`).join('')
  }</div>`;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('show');}

// ══════════════════════════════════════════════
//  TRACKING — nhập tay
// ══════════════════════════════════════════════
let trackSearchRows=[];

function showTrackSearch(){
  const q=(document.getElementById('ti-search').value||'').toLowerCase().trim();
  const dd=document.getElementById('ti-dropdown');
  if(!q||q.length<2){dd.classList.remove('show');return;}
  const matches=allData.filter(r=>
    getStatus(r)!=='expired'&&
    ((r.QDTT||'').toLowerCase().includes(q)||(r.TenThuoc||'').toLowerCase().includes(q))
  ).slice(0,15);
  if(!matches.length){dd.classList.remove('show');return;}
  trackSearchRows=matches;
  dd.classList.add('show');
  dd.innerHTML=matches.map((r,i)=>`
    <div class="ti-dd-item" onclick="selectTrackRow(${i})">
      <div class="din">${r.TenThuoc}</div>
      <div class="dis">${r.QDTT} | ${r.TenHoatChat} | SL: ${fmtNum(r.SLPhanBo)} ${r.DonViTinh}</div>
    </div>`).join('');
}

function selectTrackRow(i){
  selectedTrackRow=trackSearchRows[i];
  document.getElementById('ti-search').value=`${selectedTrackRow.TenThuoc} — ${selectedTrackRow.QDTT}`;
  document.getElementById('ti-dropdown').classList.remove('show');
  document.getElementById('ti-qty').focus();
}

document.addEventListener('click',e=>{
  if(!e.target.closest('#ti-search')&&!e.target.closest('#ti-dropdown'))
    document.getElementById('ti-dropdown')?.classList.remove('show');
});

function addEntry(){
  if(!selectedTrackRow){alert('Vui lòng chọn thuốc từ danh sách gợi ý!');return;}
  const month=document.getElementById('ti-month').value;
  const qty=parseInt(document.getElementById('ti-qty').value)||0;
  if(!month||qty<=0){alert('Vui lòng nhập tháng và số lượng hợp lệ!');return;}
  const id=selectedTrackRow.id;
  // Lấy drug mới nhất từ allData để đảm bảo SLPhanBo đúng
  const freshDrug=allData.find(r=>r.id===selectedTrackRow.id)||(selectedTrackRow);
  if(!trackData[id]) trackData[id]={drug:freshDrug,entries:[]};
  else trackData[id].drug=freshDrug; // luôn cập nhật drug mới nhất
  const ex=trackData[id].entries.find(e=>e.month===month);
  if(ex) ex.qty+=qty; else trackData[id].entries.push({month,qty});
  trackData[id].entries.sort((a,b)=>a.month.localeCompare(b.month));
  document.getElementById('ti-qty').value='';
  document.getElementById('ti-search').value='';
  selectedTrackRow=null;
  logTrack(`✅ +${qty.toLocaleString('vi')} ${trackData[id].drug.DonViTinh} — ${trackData[id].drug.TenThuoc} (${month})`);
  saveTrackLS();
  renderTracking();
}

function renderTracking(){
  const rows=Object.values(trackData);
  const body=document.getElementById('track-body');
  if(!rows.length){
    body.innerHTML=`<tr><td colspan="11" class="no-data"><div style="font-size:26px">📊</div><div>Chưa có dữ liệu theo dõi phân bổ</div></td></tr>`;
    return;
  }
  body.innerHTML=rows.map((td,i)=>{
    // Luôn lấy drug mới nhất từ allData để có SLPhanBo chính xác
    const liveDrug=allData.find(r=>r.id===td.drug.id||(r.QDTT===td.drug.QDTT&&r.STT===td.drug.STT));
    const drug=liveDrug||td.drug;
    // Cập nhật drug trong trackData nếu tìm được bản mới hơn
    if(liveDrug) td.drug=liveDrug;
    const alloc=parseNum(drug.SLPhanBo)||0;
    const tot=td.entries.reduce((s,e)=>s+e.qty,0);
    const rem=alloc-tot;
    const pct=alloc>0?Math.min(100,Math.round(tot/alloc*100)):0;
    const rc=rem<=0?'rem-zero':pct>=80?'rem-low':'rem-ok';
    const pc=pct>=100?'danger':pct>=80?'warn':'';
    const isNBV=(drug.NoiBanHanh||'').toUpperCase().includes('BV');
    const detail=td.entries.map(e=>
      `<span style="display:inline-flex;align-items:center;gap:3px;margin:2px 3px;padding:2px 4px 2px 7px;background:var(--surf2);border-radius:20px;font-size:11px;border:1px solid var(--bdr)"><b>${e.month}:</b><span style="font-family:var(--mono)">${e.qty.toLocaleString('vi')}</span><button onclick="delTrackMonth('${drug.id}','${e.month}')" title="Xoá tháng ${e.month}" style="background:none;border:none;cursor:pointer;color:#c62828;font-size:14px;line-height:1;padding:0 2px;margin-left:1px" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.5" style2="opacity:.5">×</button></span>`
    ).join('')||'—';
    return `<tr>
      <td class="tdm">${i+1}</td>
      <td><span class="badge ${isNBV?'bb':'bs'}">${drug.QDTT}</span></td>
      <td class="tdn" title="${drug.TenThuoc}">${drug.TenThuoc}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${drug.TenHoatChat}">${drug.TenHoatChat}</td>
      <td class="tdc">${drug.DonViTinh}</td>
      <td class="tdm">${fmtNum(alloc)}</td>
      <td class="tdm">${tot.toLocaleString('vi')}</td>
      <td class="tdc"><span class="${rc}">${rem.toLocaleString('vi')}</span></td>
      <td class="tdc" style="white-space:nowrap">
        <span class="prog-bar"><span class="prog-fill ${pc}" style="width:${pct}%"></span></span>
        <span style="font-size:11px;font-family:var(--mono)">${pct}%</span>
      </td>
      <td style="white-space:normal;min-width:160px">${detail}</td>
      <td class="tdc"><button class="btn btn-ghost btn-sm" onclick="delTrack('${drug.id}')">🗑</button></td>
    </tr>`;
  }).join('');
}

function delTrack(id){
  if(!confirm('Xoá toàn bộ dữ liệu nhập kho của thuốc này?')) return;
  delete trackData[id]; saveTrackLS(); renderTracking();
}

function delTrackMonth(id, month){
  if(!trackData[id]) return;
  const drug = trackData[id].drug;
  const entry = trackData[id].entries.find(e=>e.month===month);
  if(!entry) return;
  if(!confirm(`Xoá ${entry.qty.toLocaleString('vi')} ${drug.DonViTinh} nhập tháng ${month}\ncủa thuốc: ${drug.TenThuoc}?`)) return;
  trackData[id].entries = trackData[id].entries.filter(e=>e.month!==month);
  // Nếu không còn tháng nào thì giữ nguyên dòng thuốc (không xoá hẳn)
  logTrack(`🗑 Đã xoá tháng ${month} của ${drug.TenThuoc}`);
  saveTrackLS(); renderTracking();
}
function clearTrack(){
  if(!confirm('Xoá TOÀN BỘ dữ liệu nhập kho?')) return;
  trackData={}; saveTrackLS(); renderTracking();
  logTrack('🗑 Đã xoá toàn bộ');
}
function saveTrackLS(){try{localStorage.setItem('bvdn_track',JSON.stringify(trackData));}catch(e){}}
function logTrack(msg){
  const el=document.getElementById('track-log');
  el.classList.add('show');
  el.innerHTML=`<p>${new Date().toLocaleTimeString('vi')} — ${msg}</p>`+el.innerHTML;
}

// ══════════════════════════════════════════════
//  GITHUB SYNC — lưu trackData lên GitHub repo
// ══════════════════════════════════════════════
let ghConfig={token:'',repo:''};

function loadGHConfig(){
  try{
    const s=localStorage.getItem('bvdn_gh');
    if(s){
      ghConfig=JSON.parse(s);
      if(ghConfig.token) document.getElementById('gh-token').value=ghConfig.token;
      if(ghConfig.repo)  document.getElementById('gh-repo').value=ghConfig.repo;
    }
  }catch(e){}
}

function saveGHConfig(){
  ghConfig.token=document.getElementById('gh-token').value.trim();
  ghConfig.repo=document.getElementById('gh-repo').value.trim();
  if(!ghConfig.token||!ghConfig.repo){alert('Vui lòng nhập đủ Token và Repo!');return;}
  localStorage.setItem('bvdn_gh',JSON.stringify(ghConfig));
  showGHStatus('info','✅ Đã lưu cấu hình GitHub!');
}

function showGHStatus(type,msg){
  const el=document.getElementById('gh-status');
  el.style.display='';
  el.className='gh-status gh-'+type;
  el.textContent=msg;
}

async function pushTrackToGithub(){
  if(!ghConfig.token||!ghConfig.repo){alert('Chưa cấu hình GitHub Token và Repo!');return;}
  showGHStatus('info','⏳ Đang đẩy dữ liệu lên GitHub...');
  const content=btoa(unescape(encodeURIComponent(JSON.stringify(trackData,null,2))));
  const url=`https://api.github.com/repos/${ghConfig.repo}/contents/track-data.json`;
  try{
    // Lấy SHA file cũ nếu có
    let sha='';
    try{
      const r=await fetch(url,{headers:{'Authorization':`token ${ghConfig.token}`,'Accept':'application/vnd.github.v3+json'}});
      if(r.ok){const d=await r.json();sha=d.sha||'';}
    }catch(e){}

    const body={message:`Update track-data ${new Date().toLocaleString('vi')}`,content};
    if(sha) body.sha=sha;

    const res=await fetch(url,{
      method:'PUT',
      headers:{'Authorization':`token ${ghConfig.token}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if(res.ok){
      showGHStatus('ok',`✅ Đã đẩy thành công! ${Object.keys(trackData).length} thuốc — ${new Date().toLocaleString('vi')}`);
    } else {
      const err=await res.json();
      showGHStatus('err','❌ Lỗi: '+(err.message||res.status));
    }
  }catch(e){showGHStatus('err','❌ Lỗi mạng: '+e.message);}
}

async function pullTrackFromGithub(){
  if(!ghConfig.token||!ghConfig.repo){alert('Chưa cấu hình GitHub Token và Repo!');return;}
  showGHStatus('info','⏳ Đang kéo dữ liệu từ GitHub...');
  const url=`https://api.github.com/repos/${ghConfig.repo}/contents/track-data.json`;
  try{
    const res=await fetch(url,{headers:{'Authorization':`token ${ghConfig.token}`,'Accept':'application/vnd.github.v3+json'}});
    if(!res.ok){showGHStatus('err','❌ Không tìm thấy file track-data.json trên GitHub');return;}
    const data=await res.json();
    const decoded=decodeURIComponent(escape(atob(data.content.replace(/\n/g,''))));
    const pulled=JSON.parse(decoded);
    // Merge
    let merged=0;
    Object.entries(pulled).forEach(([id,td])=>{
      if(!trackData[id]){trackData[id]=td;merged++;}
      else{
        // Merge entries theo tháng
        td.entries.forEach(e=>{
          const ex=trackData[id].entries.find(x=>x.month===e.month);
          if(ex) ex.qty=Math.max(ex.qty,e.qty); else trackData[id].entries.push(e);
        });
        trackData[id].entries.sort((a,b)=>a.month.localeCompare(b.month));
      }
    });
    saveTrackLS(); renderTracking();
    showGHStatus('ok',`✅ Đã kéo về! Merge ${merged} thuốc mới — ${new Date().toLocaleString('vi')}`);
    logTrack(`⬇️ Kéo từ GitHub: ${Object.keys(pulled).length} thuốc`);
  }catch(e){showGHStatus('err','❌ Lỗi: '+e.message);}
}

// ══════════════════════════════════════════════
//  TRACK FILE LOADERS
// ══════════════════════════════════════════════
function loadTrackFile(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
      let added=0;
      rows.slice(1).forEach(row=>{
        const qdtt=String(row[0]||'').trim();
        const ten=String(row[1]||'').trim().toLowerCase();
        const qty=parseInt(row[2])||0;
        const month=String(row[3]||'').trim();
        if(!qty||!month) return;
        const drug=allData.find(r=>r.QDTT===qdtt||(r.TenThuoc||'').toLowerCase()===ten);
        if(!drug) return;
        if(!trackData[drug.id]) trackData[drug.id]={drug,entries:[]};
        const ex=trackData[drug.id].entries.find(e=>e.month===month);
        if(ex) ex.qty+=qty; else trackData[drug.id].entries.push({month,qty});
        trackData[drug.id].entries.sort((a,b)=>a.month.localeCompare(b.month));
        added++;
      });
      logTrack(`📑 Nạp nhập kho: ${added} bản ghi từ ${file.name}`);
      saveTrackLS(); renderTracking();
    }catch(err){logTrack(`❌ ${err.message}`);}
  };
  reader.readAsArrayBuffer(file); event.target.value='';
}

function loadSavedTrack(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
      const months=(rows[0]||[]).slice(5);
      let loaded=0;
      rows.slice(1).forEach(row=>{
        const qdtt=String(row[0]||'').trim();
        const drug=allData.find(r=>r.QDTT===qdtt); if(!drug) return;
        if(!trackData[drug.id]) trackData[drug.id]={drug,entries:[]};
        months.forEach((m,i)=>{
          if(!m) return; const qty=parseInt(row[5+i])||0; if(!qty) return;
          const ex=trackData[drug.id].entries.find(e=>e.month===String(m));
          if(ex) ex.qty=qty; else trackData[drug.id].entries.push({month:String(m),qty});
        });
        trackData[drug.id].entries.sort((a,b)=>a.month.localeCompare(b.month));
        loaded++;
      });
      logTrack(`💾 Nạp file lưu: ${loaded} thuốc từ ${file.name}`);
      saveTrackLS(); renderTracking();
    }catch(err){logTrack(`❌ ${err.message}`);}
  };
  reader.readAsArrayBuffer(file); event.target.value='';
}

function exportTrackExcel(){
  const rows=Object.values(trackData);
  if(!rows.length){alert('Chưa có dữ liệu để xuất!');return;}
  const allMonths=[...new Set(rows.flatMap(td=>td.entries.map(e=>e.month)))].sort();
  const header=['QĐTT','Tên thuốc','Hoạt chất','ĐVT','SL phân bổ',...allMonths,'Tổng nhập','Còn lại','% Nhập'];
  const data=[header,...rows.map(td=>{
    const alloc=parseFloat(td.drug.SLPhanBo)||0;
    const mqs=allMonths.map(m=>(td.entries.find(e=>e.month===m)||{}).qty||0);
    const tot=mqs.reduce((a,b)=>a+b,0);
    return[td.drug.QDTT,td.drug.TenThuoc,td.drug.TenHoatChat,td.drug.DonViTinh,alloc,...mqs,tot,alloc-tot,alloc>0?Math.round(tot/alloc*100)+'%':'0%'];
  })];
  const ws=XLSX.utils.aoa_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Theo dõi phân bổ');
  XLSX.writeFile(wb,`PhanBo_${TODAY}.xlsx`);
}

// ══════════════════════════════════════════════
//  MAIN EXCEL UPLOAD — dual format detect
// ══════════════════════════════════════════════
function detectFmt(headerRow){
  if(!headerRow) return 'old';
  const h=headerRow.map(v=>String(v||'').toLowerCase().trim());
  if(h[3]&&h[3].includes('tên thuốc')) return 'new';
  return h.filter(v=>v).length<=22?'new':'old';
}

function parseRowExcel(row,fmt,idx,fname){
  const c=i=>String(row[i]||'').trim().replace(/\n/g,' ');
  const si=v=>{try{const f=parseFloat(v);return(f!==f)?null:parseInt(f);}catch{return null;}};
  const stt=si(row[0]); if(stt===null) return null;

  const guessNBH=q=>{
    if(!q) return '';
    const u=q.toUpperCase();
    if(['BVĐN','BVDN','QĐ-BV','TTMS'].some(k=>u.includes(k))) return 'BVĐN';
    if(u.includes('SYT')) return 'SYT';
    return 'BVĐN';
  };

  if(fmt==='new'){
    const qdtt=c(17);
    return{id:`${fname}_${idx}`,STT:String(stt),TT20:c(1),GoiNhom:c(2),
      TenThuoc:c(3),TenHoatChat:c(4),NongDo:c(5),DuongDung:c(6),DangBaoChe:c(7),
      QuyCach:c(8),HanDung:c(9),SDK:c(10),HangSanXuat:c(11),NuocSanXuat:c(12),
      DonViTinh:c(13),DonGia:c(14),SLPhanBo:c(15),SLPhanBoBHYT:'',SLTuyChon:c(16),
      DieuTiet:'',LuuY:c(18),NhaThau:row.length>21?c(21):'',
      QDTT:qdtt,NgayBatDau:'',NgayHetHieu:'',NoiBanHanh:guessNBH(qdtt)};
  }
  return{id:`${fname}_${idx}`,STT:String(stt),TT20:c(1),GoiNhom:c(2),
    TenThuoc:c(4),TenHoatChat:c(5),NongDo:c(6),DuongDung:c(7),DangBaoChe:c(8),
    QuyCach:c(9),HanDung:c(10),SDK:c(11),HangSanXuat:c(12),NuocSanXuat:c(13),
    DonViTinh:c(14),DonGia:c(15),SLPhanBo:c(16),SLPhanBoBHYT:c(17),SLTuyChon:c(18),
    DieuTiet:c(19),LuuY:c(20),NhaThau:c(21),QDTT:c(22),
    NgayBatDau:fmtDateFromRaw(row[23]),NgayHetHieu:fmtDateFromRaw(row[24]),NoiBanHanh:c(25)};
}

function loadMainFile(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
      let added=0,updated=0;
      const fname='u'+Date.now();

      wb.SheetNames.forEach(sn=>{
        const rawData=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true});
        let headerIdx=-1,startIdx=-1;
        for(let i=0;i<Math.min(rawData.length,12);i++){
          const joined=rawData[i].map(v=>String(v||'').toLowerCase()).join('|');
          if(joined.includes('tên thuốc')||joined.includes('ten thuoc')||rawData[i][0]?.toString().toLowerCase()==='stt'){
            headerIdx=i; startIdx=i+1; break;
          }
        }
        if(startIdx<0){for(let i=0;i<rawData.length;i++){try{if(parseFloat(rawData[i][0])>=1){startIdx=i;break;}}catch(e){}}}
        if(startIdx<0) return;

        const fmt=detectFmt(headerIdx>=0?rawData[headerIdx]:null);
        rawData.slice(startIdx).forEach((row,idx)=>{
          while(row.length<26) row.push(null);
          const parsed=parseRowExcel(row,fmt,startIdx+idx,fname);
          if(!parsed||!parsed.TenThuoc) return;
          const ex=allData.find(r=>r.QDTT===parsed.QDTT&&r.STT===parsed.STT);
          if(ex){Object.assign(ex,parsed);ex.id=ex.id;updated++;}
          else{allData.push(parsed);added++;}
        });
      });

      logMain(`📂 <strong>${file.name}</strong> — ✅ Thêm: ${added} | 🔄 Cập nhật: ${updated}`);
      document.getElementById('loaded-count').textContent=allData.length.toLocaleString('vi');
      switchTab('catalog'); applyFilters();
    }catch(err){logMain(`❌ Lỗi: ${err.message}`);console.error(err);}
  };
  reader.readAsArrayBuffer(file); event.target.value='';
}

// ══════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════
function exportVisibleExcel(){
  const vc=COLS.filter(c=>c.show&&!['_status','_detail'].includes(c.key));
  const data=[vc.map(c=>c.label),...filtered.map(row=>vc.map(col=>row[col.key]||''))];
  const ws=XLSX.utils.aoa_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Danh mục');
  XLSX.writeFile(wb,`DanhMuc_${TODAY}.xlsx`);
}

// ══════════════════════════════════════════════
//  LOCAL STORAGE
// ══════════════════════════════════════════════
function tryLoadLS(){
  try{
    const t=localStorage.getItem('bvdn_track');
    if(t) trackData=JSON.parse(t);
    const s=localStorage.getItem('bvdn_extra');
    if(s){
      const extra=JSON.parse(s);
      extra.forEach(nr=>{
        const ex=allData.find(r=>r.QDTT===nr.QDTT&&r.STT===nr.STT);
        if(ex) Object.assign(ex,{...nr,id:ex.id}); else allData.push(nr);
      });
      if(extra.length) logMain(`🔄 Khôi phục ${extra.length} mục bổ sung từ trình duyệt`);
    }
  }catch(e){}
}

function saveLS(){
  try{
    const extra=allData.filter(r=>r.id.startsWith('u'));
    localStorage.setItem('bvdn_extra',JSON.stringify(extra));
    localStorage.setItem('bvdn_track',JSON.stringify(trackData));
    alert(`✅ Đã lưu!\n• ${extra.length} mục danh mục bổ sung\n• ${Object.keys(trackData).length} thuốc phân bổ`);
  }catch(e){alert('❌ Lỗi: '+e.message);}
}

function loadLS(){
  tryLoadLS(); applyFilters(); renderTracking();
  alert('✅ Đã khôi phục từ trình duyệt!');
}

function exportJSON(){
  const payload={data:allData.filter(r=>r.id.startsWith('u')),track:trackData};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`Backup_${TODAY}.json`;
  a.click();
  logMain(`📤 Xuất JSON: ${payload.data.length} mục danh mục + ${Object.keys(payload.track).length} thuốc phân bổ`);
}

function importJSON(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const p=JSON.parse(e.target.result);
      let added=0,updated=0;
      if(Array.isArray(p)){
        // backup dạng cũ - toàn bộ allData
        p.forEach(nr=>{const ex=allData.find(r=>r.QDTT===nr.QDTT&&r.STT===nr.STT);if(ex){Object.assign(ex,{...nr,id:ex.id});updated++;}else{allData.push(nr);added++;}});
      } else {
        if(p.data) p.data.forEach(nr=>{const ex=allData.find(r=>r.QDTT===nr.QDTT&&r.STT===nr.STT);if(ex){Object.assign(ex,{...nr,id:ex.id});updated++;}else{allData.push(nr);added++;}});
        if(p.track) Object.assign(trackData,p.track);
      }
      saveTrackLS();
      document.getElementById('loaded-count').textContent=allData.length.toLocaleString('vi');
      switchTab('catalog'); applyFilters(); renderTracking();
      logMain(`📥 Nạp JSON: +${added} mới, ~${updated} cập nhật`);
    }catch(err){alert('Lỗi: '+err.message);}
  };
  reader.readAsText(file); event.target.value='';
}

function logMain(msg){
  const el=document.getElementById('main-log');
  el.classList.add('show');
  el.innerHTML=`<p>${new Date().toLocaleTimeString('vi')} — ${msg}</p>`+el.innerHTML;
  document.getElementById('loaded-count').textContent=allData.length.toLocaleString('vi');
}

// ══════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════
function switchTab(name){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
  if(name==='tracking') renderTracking();
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function fmtDate(s){if(!s||s.length<10) return s||'';const[y,m,d]=s.split('-');return`${d}/${m}/${y}`;}
function fmtDateFromRaw(v){
  if(!v) return '';const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  try{const d=new Date(v);if(!isNaN(d)) return d.toISOString().slice(0,10);}catch(e){}
  return '';
}
function fmtMoney(v){const n=parseNum(v);return(n===0)?v||'':n.toLocaleString('vi-VN');}
function parseNum(v){
  // Xử lý mọi định dạng số: '173,300' '173.300' '173300' '1,200,000'
  if(v===null||v===undefined||v===''||v===false) return 0;
  const s=String(v).trim();
  if(!s||s==='-'||s==='—') return 0;
  // Bỏ tất cả dấu phẩy (phân cách ngàn kiểu US/Excel)
  let c=s.replace(/,/g,'');
  // Nếu còn dấu chấm mà phần sau có đúng 3 chữ số -> cũng là phân cách ngàn (kiểu VN)
  const parts=c.split('.');
  if(parts.length>1 && parts[parts.length-1].length===3 && parts.every(p=>/^\d+$/.test(p)))
    c=parts.join('');
  const n=parseFloat(c);
  return isNaN(n)?0:n;
}
function fmtNum(v){const n=parseNum(v);return(n===0)?'—':n.toLocaleString('vi-VN');}
function highlight(text,q){if(!q||!text) return text;return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),'<mark>$1</mark>');}
